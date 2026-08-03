#!/usr/bin/env bash

set -euo pipefail
umask 077

readonly COMPOSE_PROJECT="code-quest"
readonly DATA_VOLUME="code-quest_codequest-data"

fail() {
  printf 'Release upgrade test failed: %s\n' "$1" >&2
  exit 1
}

script_dir="$(CDPATH= cd -P -- "$(dirname -- "${BASH_SOURCE[0]}")" 2>/dev/null && pwd)"
repository_dir="$(CDPATH= cd -P -- "$script_dir/.." 2>/dev/null && pwd)"
[ -n "$repository_dir" ] || fail "the repository root could not be resolved"

if [ "${GITHUB_ACTIONS:-}" != "true" ] ||
  [ "${CODE_QUEST_DISPOSABLE_UPGRADE_TEST:-}" != "1" ] ||
  [ "${CODE_QUEST_RUNNER_ENVIRONMENT:-}" != "github-hosted" ]; then
  fail "this destructive cleanup test may run only on an explicitly disposable GitHub-hosted runner"
fi

if [ -n "${COMPOSE_PROJECT_NAME:-}" ] || [ -n "${COMPOSE_FILE:-}" ]; then
  fail "COMPOSE_PROJECT_NAME and COMPOSE_FILE must not override the shipped Compose contract"
fi

for required_command in docker git node sha256sum stat unzip; do
  command -v "$required_command" >/dev/null 2>&1 ||
    fail "$required_command is required"
done
docker compose version >/dev/null 2>&1 || fail "Docker Compose is required"
docker info >/dev/null 2>&1 || fail "Docker is not available"

baseline_outputs="$(
  node "$repository_dir/tools/release-automation.mjs" upgrade-baseline \
    "$repository_dir/tools/release-upgrade-baseline.json"
)" || fail "the release upgrade baseline could not be read"
BASELINE_COMMIT=""
BASELINE_ZIP_SHA256=""
while IFS='=' read -r output_name output_value; do
  case "$output_name" in
    baseline-commit)
      BASELINE_COMMIT="$output_value"
      ;;
    baseline-zip-sha256)
      BASELINE_ZIP_SHA256="$output_value"
      ;;
  esac
done <<<"$baseline_outputs"
[ -n "$BASELINE_COMMIT" ] || fail "the baseline source commit is missing"
[ -n "$BASELINE_ZIP_SHA256" ] || fail "the baseline ZIP SHA-256 is missing"
readonly BASELINE_COMMIT BASELINE_ZIP_SHA256

existing_containers="$(
  docker ps --all --quiet --filter "label=com.docker.compose.project=$COMPOSE_PROJECT"
)"
[ -z "$existing_containers" ] ||
  fail "the runner already has containers for the $COMPOSE_PROJECT project"
if docker volume inspect "$DATA_VOLUME" >/dev/null 2>&1; then
  fail "the runner already has the $DATA_VOLUME volume"
fi

test_root="$(mktemp -d "${RUNNER_TEMP:-/tmp}/code-quest-upgrade.XXXXXX")" ||
  fail "a temporary test directory could not be created"
release_root="$test_root/releases"
installation_parent="$test_root/installation"
baseline_zip="$release_root/baseline/code-quest.zip"
current_zip="$release_root/current/code-quest.zip"
old_install="$installation_parent/code-quest-old"
new_install="$installation_parent/code-quest"
state_file="$test_root/release-upgrade-state.json"
active_install=""
may_own_resources=0

cleanup() {
  local exit_status=$?
  local cleanup_status=0
  local compose_dir=""

  trap - EXIT
  set +e
  if [ -f "$new_install/docker-compose.yml" ]; then
    compose_dir="$new_install"
  elif [ -f "$old_install/docker-compose.yml" ]; then
    compose_dir="$old_install"
  elif [ -n "$active_install" ] && [ -f "$active_install/docker-compose.yml" ]; then
    compose_dir="$active_install"
  fi

  if [ "$exit_status" -ne 0 ] && [ -n "$compose_dir" ]; then
    (
      cd "$compose_dir" || exit
      docker compose ps
      docker compose logs --no-color --tail=200
    ) >&2
  fi
  if [ "$may_own_resources" -eq 1 ] && [ -n "$compose_dir" ]; then
    (
      cd "$compose_dir" || exit
      docker compose down --volumes --remove-orphans
    ) >/dev/null 2>&1 || cleanup_status=$?
  fi
  rm -rf -- "$test_root"
  if [ "$exit_status" -eq 0 ] && [ "$cleanup_status" -ne 0 ]; then
    printf 'Release upgrade test cleanup failed with status %s\n' \
      "$cleanup_status" >&2
    exit "$cleanup_status"
  fi
  exit "$exit_status"
}
trap cleanup EXIT

mkdir -p "$release_root/baseline" "$release_root/current" "$installation_parent"

git -C "$repository_dir" cat-file -e "$BASELINE_COMMIT^{commit}" 2>/dev/null ||
  fail "the full baseline commit is unavailable; checkout must use fetch-depth: 0"
# The distributed ZIP stored its commit timestamps in the Asia/Seoul timezone.
(umask 022 && LC_ALL=C TZ=Asia/Seoul git -C "$repository_dir" archive \
  --format=zip \
  --prefix=code-quest/ \
  --output="$baseline_zip" \
  "$BASELINE_COMMIT") || fail "the baseline ZIP could not be reconstructed"
actual_baseline_hash="$(sha256sum "$baseline_zip" | awk '{ print $1 }')"
[ "$actual_baseline_hash" = "$BASELINE_ZIP_SHA256" ] ||
  fail "the reconstructed baseline ZIP does not match the distributed ZIP"
unzip -tqq "$baseline_zip" || fail "the baseline ZIP failed its integrity check"

"$repository_dir/tools/build-release-zip.sh" "$current_zip"
unzip -tqq "$current_zip" || fail "the current ZIP failed its integrity check"

(umask 022 && unzip -q "$baseline_zip" -d "$installation_parent")
active_install="$installation_parent/code-quest"
[ -x "$active_install/start.sh" ] || fail "the baseline start.sh is not executable"
[ ! -e "$active_install/.env" ] || fail "the baseline ZIP unexpectedly contains .env"

may_own_resources=1
(
  cd "$active_install"
  set -o pipefail
  CODE_QUEST_NO_OPEN=1 ./start.sh 2>&1 |
    tee "$test_root/baseline-start.log"
)

[ -f "$active_install/.env" ] || fail "the baseline start did not create .env"
[ "$(stat -c '%a' "$active_install/.env")" = "600" ] ||
  fail "the baseline .env permissions are not 600"
env_hash_before="$(sha256sum "$active_install/.env" | awk '{ print $1 }')"

docker volume inspect "$DATA_VOLUME" >/dev/null 2>&1 ||
  fail "the baseline did not create the expected named volume"
volume_created_before="$(
  docker volume inspect "$DATA_VOLUME" --format '{{ .CreatedAt }}'
)"
volume_mountpoint_before="$(
  docker volume inspect "$DATA_VOLUME" --format '{{ .Mountpoint }}'
)"
volume_project_label="$(
  docker volume inspect "$DATA_VOLUME" \
    --format '{{ index .Labels "com.docker.compose.project" }}'
)"
volume_name_label="$(
  docker volume inspect "$DATA_VOLUME" \
    --format '{{ index .Labels "com.docker.compose.volume" }}'
)"
[ "$volume_project_label" = "$COMPOSE_PROJECT" ] ||
  fail "the data volume has an unexpected Compose project label"
[ "$volume_name_label" = "codequest-data" ] ||
  fail "the data volume has an unexpected Compose volume label"

postgres_container="$(
  cd "$active_install"
  docker compose ps --quiet postgres
)"
[ -n "$postgres_container" ] || fail "the baseline PostgreSQL container is missing"
baseline_postgres_volume="$(
  docker inspect "$postgres_container" --format \
    '{{ range .Mounts }}{{ if eq .Destination "/var/lib/postgresql/data" }}{{ .Name }}{{ end }}{{ end }}'
)"
[ "$baseline_postgres_volume" = "$DATA_VOLUME" ] ||
  fail "the baseline PostgreSQL container mounted an unexpected volume"

baseline_flyway_versions="$(
  cd "$active_install"
  docker compose exec -T postgres sh -ec \
    'psql --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --tuples-only --no-align --command="$1"' \
    sh 'SELECT version FROM flyway_schema_history WHERE success ORDER BY installed_rank;'
)"
[ "$baseline_flyway_versions" = "1" ] ||
  fail "the baseline database does not contain exactly Flyway V1"

node "$repository_dir/tools/audit-grading-contracts.mjs" \
  upgrade-seed "$state_file"

(
  cd "$active_install"
  docker compose down
)
docker volume inspect "$DATA_VOLUME" >/dev/null 2>&1 ||
  fail "docker compose down removed the learning data volume"
[ "$(docker volume inspect "$DATA_VOLUME" --format '{{ .CreatedAt }}')" = "$volume_created_before" ] ||
  fail "the learning data volume was replaced after stopping the baseline"
[ -z "$(docker ps --all --quiet --filter "label=com.docker.compose.project=$COMPOSE_PROJECT")" ] ||
  fail "baseline containers remain after docker compose down"

mv "$active_install" "$old_install"
active_install="$old_install"
(umask 022 && unzip -q "$current_zip" -d "$installation_parent")
[ -x "$new_install/start.sh" ] || fail "the current start.sh is not executable"
[ ! -e "$new_install/.env" ] || fail "the current ZIP unexpectedly contains .env"
cp -p -- "$old_install/.env" "$new_install/.env"
[ "$(stat -c '%a' "$new_install/.env")" = "600" ] ||
  fail "the copied .env permissions are not 600"
[ "$(sha256sum "$new_install/.env" | awk '{ print $1 }')" = "$env_hash_before" ] ||
  fail "the copied .env content changed"

active_install="$new_install"
(
  cd "$active_install"
  set -o pipefail
  CODE_QUEST_NO_OPEN=1 ./start.sh 2>&1 |
    tee "$test_root/current-start.log"
)

[ "$(sha256sum "$new_install/.env" | awk '{ print $1 }')" = "$env_hash_before" ] ||
  fail "the current start modified the copied .env"
env_backup="$(find "$new_install" -maxdepth 1 -type f -name '.env.backup-*' -print -quit)"
[ -z "$env_backup" ] || fail "the current start unexpectedly created an .env backup"
[ "$(docker volume inspect "$DATA_VOLUME" --format '{{ .CreatedAt }}')" = "$volume_created_before" ] ||
  fail "the current release replaced the learning data volume"
[ "$(docker volume inspect "$DATA_VOLUME" --format '{{ .Mountpoint }}')" = "$volume_mountpoint_before" ] ||
  fail "the current release mounted a different learning data path"

postgres_container="$(
  cd "$active_install"
  docker compose ps --quiet postgres
)"
[ -n "$postgres_container" ] || fail "the current PostgreSQL container is missing"
current_postgres_volume="$(
  docker inspect "$postgres_container" --format \
    '{{ range .Mounts }}{{ if eq .Destination "/var/lib/postgresql/data" }}{{ .Name }}{{ end }}{{ end }}'
)"
[ "$current_postgres_volume" = "$DATA_VOLUME" ] ||
  fail "the current PostgreSQL container did not reuse the baseline volume"

current_flyway_versions="$(
  cd "$active_install"
  docker compose exec -T postgres sh -ec \
    'psql --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --tuples-only --no-align --command="$1"' \
    sh 'SELECT version FROM flyway_schema_history WHERE success ORDER BY installed_rank;'
)"
[ "$current_flyway_versions" = $'1\n2' ] ||
  fail "the upgraded database does not contain successful Flyway V1 and V2"
learning_column_count="$(
  cd "$active_install"
  docker compose exec -T postgres sh -ec \
    'psql --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --tuples-only --no-align --command="$1"' \
    sh "SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'problems' AND column_name = 'learning_json';"
)"
[ "$learning_column_count" = "1" ] ||
  fail "Flyway V2 did not add problems.learning_json"

node "$repository_dir/tools/audit-grading-contracts.mjs" \
  upgrade-verify "$state_file"
printf 'Release upgrade test passed: %s -> %s\n' \
  "$BASELINE_COMMIT" "$(git -C "$repository_dir" rev-parse HEAD)"
