#!/usr/bin/env bash

set -euo pipefail

script_dir="$(CDPATH= cd -P -- "$(dirname -- "${BASH_SOURCE[0]}")" 2>/dev/null && pwd)"
project_dir="$(CDPATH= cd -P -- "$script_dir/.." 2>/dev/null && pwd)"
test_root="$(mktemp -d "${TMPDIR:-/tmp}/code-quest-bootstrap.XXXXXX")"

cleanup() {
  rm -rf "$test_root"
}
trap cleanup EXIT

fail() {
  printf 'Bootstrap test failed: %s\n' "$1" >&2
  exit 1
}

env_value() {
  local file="$1"
  local key="$2"

  awk -v key="$key" '
    $0 ~ "^" key "=" {
      sub("^[^=]*=", "")
      value = $0
    }
    END {
      printf "%s", value
    }
  ' "$file"
}

file_hash() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{ print $1 }'
  else
    LC_ALL=C shasum -a 256 "$1" | awk '{ print $1 }'
  fi
}

assert_generated_env() {
  local env_file="$1"
  local database_password
  local java_token
  local javascript_token

  [ -f "$env_file" ] || fail ".env was not generated"
  database_password="$(env_value "$env_file" "POSTGRES_PASSWORD")"
  java_token="$(env_value "$env_file" "JAVA_RUNNER_TOKEN")"
  javascript_token="$(env_value "$env_file" "JAVASCRIPT_RUNNER_TOKEN")"

  [ "${#database_password}" -ge 32 ] || fail "database password is too short"
  [ "${#java_token}" -eq 64 ] || fail "Java token is not 64 hex characters"
  [ "${#javascript_token}" -eq 64 ] || fail "JavaScript token is not 64 hex characters"
  [ "$java_token" != "$javascript_token" ] || fail "runner tokens are identical"

  case "$database_password$java_token$javascript_token" in
    *replace* | *change* | *example* | *placeholder*)
      fail "generated .env still contains a placeholder secret"
      ;;
  esac

  printf '%s' "$java_token$javascript_token" | LC_ALL=C grep -Eq '^[0-9a-f]{128}$' ||
    fail "runner tokens are not lowercase hexadecimal"
}

assert_private_mode() {
  local env_file="$1"
  local mode

  if mode="$(stat -f '%Lp' "$env_file" 2>/dev/null)"; then
    :
  else
    mode="$(stat -c '%a' "$env_file")"
  fi
  [ "$mode" = "600" ] || fail ".env permissions are $mode instead of 600"
}

make_case() {
  local case_name="$1"
  local case_dir="$test_root/$case_name"

  mkdir -p "$case_dir/mock-bin"
  cp "$project_dir/.env.example" "$case_dir/.env.example"
  cp "$project_dir/docker-compose.yml" "$case_dir/docker-compose.yml"
  cp "$project_dir/start.sh" "$case_dir/start.sh"
  cp "$project_dir/start.command" "$case_dir/start.command"
  cp "$project_dir/start.ps1" "$case_dir/start.ps1"
  chmod +x "$case_dir/start.sh" "$case_dir/start.command"

  cat >"$case_dir/mock-bin/docker" <<'MOCK_DOCKER'
#!/usr/bin/env bash
set -u
printf '%s\n' "$*" >>"${CODE_QUEST_DOCKER_LOG:?}"
if [ "${CODE_QUEST_DOCKER_MODE:-ok}" = "engine-down" ] && [ "${1:-}" = "info" ]; then
  exit 1
fi
if [ "$*" = "compose up --help" ]; then
  printf '      --wait   Wait for services to be running or healthy\n'
fi
if [ "${CODE_QUEST_DOCKER_MODE:-ok}" = "existing-volume" ] &&
  [ "${1:-}" = "volume" ] && [ "${2:-}" = "ls" ]; then
  printf 'code-quest_codequest-data\n'
fi
if [ "$*" = "compose config --quiet" ]; then
  printf 'COMPOSE_ENV|%s|%s|%s|%s|%s\n' \
    "${POSTGRES_DB-}" "${POSTGRES_USER-}" "${POSTGRES_PASSWORD-}" \
    "${JAVA_RUNNER_TOKEN-}" "${JAVASCRIPT_RUNNER_TOKEN-}" \
    >>"${CODE_QUEST_DOCKER_LOG:?}"
fi
exit 0
MOCK_DOCKER
  chmod +x "$case_dir/mock-bin/docker"
  printf '%s' "$case_dir"
}

run_unix_bootstrap() {
  local case_dir="$1"
  local mode="${2:-ok}"

  PATH="$case_dir/mock-bin:$PATH" \
    CODE_QUEST_DOCKER_LOG="$case_dir/docker.log" \
    CODE_QUEST_DOCKER_MODE="$mode" \
    CODE_QUEST_NO_OPEN=1 \
    POSTGRES_DB="stale-db" \
    POSTGRES_USER="stale-user" \
    POSTGRES_PASSWORD="replace-with-stale-password" \
    JAVA_RUNNER_TOKEN="replace-with-stale-java-token" \
    JAVASCRIPT_RUNNER_TOKEN="replace-with-stale-javascript-token" \
    bash "$case_dir/start.sh"
}

test_unix_fresh_and_rerun() {
  local case_dir
  local before_hash
  local after_hash

  case_dir="$(make_case "Unix path with spaces")"
  run_unix_bootstrap "$case_dir"
  assert_generated_env "$case_dir/.env"
  assert_private_mode "$case_dir/.env"
  grep -Fxq "compose up --detach --build --wait" "$case_dir/docker.log" ||
    fail "Unix bootstrap did not start Compose with --wait"
  grep -Fxq "COMPOSE_ENV|||||" "$case_dir/docker.log" ||
    fail "Unix bootstrap leaked inherited variables into Compose"

  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    env -u POSTGRES_DB -u POSTGRES_USER -u POSTGRES_PASSWORD \
      -u JAVA_RUNNER_TOKEN -u JAVASCRIPT_RUNNER_TOKEN \
      docker compose \
        --project-directory "$case_dir" \
        --env-file "$case_dir/.env" \
        -f "$case_dir/docker-compose.yml" \
        config --quiet
  elif [ "${CI:-}" = "true" ]; then
    fail "Docker Compose is required in CI to parse the generated .env"
  fi

  before_hash="$(file_hash "$case_dir/.env")"
  run_unix_bootstrap "$case_dir"
  after_hash="$(file_hash "$case_dir/.env")"
  [ "$before_hash" = "$after_hash" ] || fail "valid Unix .env changed on rerun"

  CODE_QUEST_NO_OPEN=1 \
    PATH="$case_dir/mock-bin:$PATH" \
    CODE_QUEST_DOCKER_LOG="$case_dir/docker.log" \
    bash "$case_dir/start.command"
}

test_unix_repairs_tokens_only() {
  local case_dir
  local database_password

  case_dir="$(make_case "Unix repair")"
  sed 's/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=keep-existing-database-password/' \
    "$case_dir/.env.example" >"$case_dir/.env"
  database_password="$(env_value "$case_dir/.env" "POSTGRES_PASSWORD")"
  run_unix_bootstrap "$case_dir"

  [ "$(env_value "$case_dir/.env" "POSTGRES_PASSWORD")" = "$database_password" ] ||
    fail "Unix repair changed the existing database password"
  assert_generated_env_tokens "$case_dir/.env"
  compgen -G "$case_dir/.env.backup.*" >/dev/null ||
    compgen -G "$case_dir/.env.backup-*" >/dev/null ||
    fail "Unix repair did not create an .env backup"
}

test_unix_repairs_all_placeholders_without_volume() {
  local case_dir

  case_dir="$(make_case "Unix placeholder repair")"
  cp "$case_dir/.env.example" "$case_dir/.env"
  run_unix_bootstrap "$case_dir"
  assert_generated_env "$case_dir/.env"
  compgen -G "$case_dir/.env.backup-*" >/dev/null ||
    fail "Unix placeholder repair did not create a backup"
}

test_unix_stale_volume_error() {
  local case_dir

  case_dir="$(make_case "Unix stale volume")"
  if run_unix_bootstrap "$case_dir" "existing-volume" >/dev/null 2>&1; then
    fail "Unix bootstrap generated a new password for an existing data volume"
  fi
  [ ! -e "$case_dir/.env" ] || fail "Unix bootstrap created .env despite an existing data volume"
}

assert_generated_env_tokens() {
  local env_file="$1"
  local java_token
  local javascript_token

  java_token="$(env_value "$env_file" "JAVA_RUNNER_TOKEN")"
  javascript_token="$(env_value "$env_file" "JAVASCRIPT_RUNNER_TOKEN")"
  [ "${#java_token}" -eq 64 ] || fail "repaired Java token has the wrong length"
  [ "${#javascript_token}" -eq 64 ] || fail "repaired JavaScript token has the wrong length"
  [ "$java_token" != "$javascript_token" ] || fail "repaired runner tokens are identical"
  printf '%s' "$java_token$javascript_token" | LC_ALL=C grep -Eq '^[0-9a-f]{128}$' ||
    fail "repaired runner tokens are not lowercase hexadecimal"
}

test_unix_engine_error() {
  local case_dir

  case_dir="$(make_case "Unix engine error")"
  if run_unix_bootstrap "$case_dir" "engine-down" >/dev/null 2>&1; then
    fail "Unix bootstrap succeeded while the Docker engine was unavailable"
  fi
  if grep -Fq "compose up" "$case_dir/docker.log"; then
    fail "Unix bootstrap attempted to start services while the engine was unavailable"
  fi
}

run_windows_bootstrap() {
  local case_dir="$1"

  PATH="$case_dir/mock-bin:$PATH" \
    CODE_QUEST_DOCKER_LOG="$case_dir/docker.log" \
    CODE_QUEST_NO_OPEN=1 \
    POSTGRES_DB="stale-db" \
    POSTGRES_USER="stale-user" \
    POSTGRES_PASSWORD="replace-with-stale-password" \
    JAVA_RUNNER_TOKEN="replace-with-stale-java-token" \
    JAVASCRIPT_RUNNER_TOKEN="replace-with-stale-javascript-token" \
    pwsh -NoLogo -NoProfile -File "$case_dir/start.ps1"
}

test_windows_bootstrap() {
  local case_dir
  local before_hash
  local after_hash
  local database_password

  if ! command -v pwsh >/dev/null 2>&1; then
    if [ "${CI:-}" = "true" ]; then
      fail "pwsh is required in CI to test start.ps1"
    fi
    printf 'Bootstrap tests: pwsh not found; Windows runtime checks skipped locally.\n'
    return
  fi

  case_dir="$(make_case "Windows path with spaces")"
  run_windows_bootstrap "$case_dir"
  assert_generated_env "$case_dir/.env"
  grep -Fxq "compose up --detach --build --wait" "$case_dir/docker.log" ||
    fail "Windows bootstrap did not start Compose with --wait"

  before_hash="$(file_hash "$case_dir/.env")"
  run_windows_bootstrap "$case_dir"
  after_hash="$(file_hash "$case_dir/.env")"
  [ "$before_hash" = "$after_hash" ] || fail "valid Windows .env changed on rerun"

  case_dir="$(make_case "Windows repair")"
  sed 's/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=keep-existing-database-password/' \
    "$case_dir/.env.example" >"$case_dir/.env"
  database_password="$(env_value "$case_dir/.env" "POSTGRES_PASSWORD")"
  run_windows_bootstrap "$case_dir"
  [ "$(env_value "$case_dir/.env" "POSTGRES_PASSWORD")" = "$database_password" ] ||
    fail "Windows repair changed the existing database password"
  assert_generated_env_tokens "$case_dir/.env"
  compgen -G "$case_dir/.env.backup-*" >/dev/null ||
    fail "Windows repair did not create an .env backup"

  case_dir="$(make_case "Windows placeholder repair")"
  cp "$case_dir/.env.example" "$case_dir/.env"
  run_windows_bootstrap "$case_dir"
  assert_generated_env "$case_dir/.env"
}

bash -n "$project_dir/start.sh" "$project_dir/start.command"
[ -x "$project_dir/start.sh" ] || fail "start.sh is not executable"
[ -x "$project_dir/start.command" ] || fail "start.command is not executable"

test_unix_fresh_and_rerun
test_unix_repairs_tokens_only
test_unix_repairs_all_placeholders_without_volume
test_unix_stale_volume_error
test_unix_engine_error
test_windows_bootstrap

git -C "$project_dir" check-ignore -q .env ||
  fail ".env is not ignored by Git"

printf 'Bootstrap tests passed.\n'
