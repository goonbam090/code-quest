#!/usr/bin/env bash

set -euo pipefail
umask 077

readonly APP_URL="http://localhost:3000"
readonly MIN_TOKEN_BYTES=32

print_info() {
  printf 'Code Quest: %s\n' "$1"
}

print_warning() {
  printf 'Code Quest 경고: %s\n' "$1" >&2
}

fail() {
  printf '\nCode Quest 실행 오류: %s\n' "$1" >&2
  exit 1
}

script_dir="$(CDPATH= cd -P -- "$(dirname -- "${BASH_SOURCE[0]}")" 2>/dev/null && pwd)"
[ -n "$script_dir" ] || fail "실행 스크립트가 있는 폴더를 확인할 수 없습니다."
cd "$script_dir" || fail "프로젝트 폴더로 이동할 수 없습니다: $script_dir"

readonly ENV_FILE="$script_dir/.env"
readonly ENV_EXAMPLE_FILE="$script_dir/.env.example"

generate_secret() {
  local secret

  if command -v openssl >/dev/null 2>&1; then
    secret="$(openssl rand -hex 32 2>/dev/null)" || return 1
  elif [ -r /dev/urandom ] &&
    command -v od >/dev/null 2>&1 &&
    command -v tr >/dev/null 2>&1; then
    secret="$(od -An -N 32 -tx1 /dev/urandom | tr -d '[:space:]')" || return 1
  else
    return 1
  fi

  [ "${#secret}" -eq 64 ] || return 1
  printf '%s' "$secret"
}

read_env_value() {
  local key="$1"

  awk -v key="$key" '
    /^[[:space:]]*#/ {
      next
    }
    {
      line = $0
      sub(/\r$/, "", line)
      if (line ~ "^[[:space:]]*" key "[[:space:]]*=") {
        sub("^[[:space:]]*" key "[[:space:]]*=", "", line)
        value = line
        found = 1
      }
    }
    END {
      if (!found) {
        exit
      }

      sub(/^[[:space:]]+/, "", value)
      sub(/[[:space:]]+$/, "", value)

      first = substr(value, 1, 1)
      last = substr(value, length(value), 1)
      if (length(value) >= 2 &&
          ((first == "\"" && last == "\"") ||
           (first == "\047" && last == "\047"))) {
        value = substr(value, 2, length(value) - 2)
      } else {
        sub(/[[:space:]]+#.*$/, "", value)
        sub(/[[:space:]]+$/, "", value)
      }

      printf "%s", value
    }
  ' "$ENV_FILE"
}

token_is_valid() {
  local value="$1"
  local byte_count
  local lowercase

  byte_count="$(LC_ALL=C printf '%s' "$value" | wc -c | tr -d '[:space:]')"
  [ "$byte_count" -ge "$MIN_TOKEN_BYTES" ] || return 1

  lowercase="$(printf '%s' "$value" | tr '[:upper:]' '[:lower:]')"
  case "$lowercase" in
    *replace* | *change* | *example* | *placeholder* | *your-token*)
      return 1
      ;;
  esac

  return 0
}

password_is_valid() {
  local value="$1"
  local lowercase

  [ -n "$value" ] || return 1
  lowercase="$(printf '%s' "$value" | tr '[:upper:]' '[:lower:]')"
  case "$lowercase" in
    *replace* | *change* | *example* | *placeholder*)
      return 1
      ;;
  esac

  return 0
}

data_volume_exists() {
  local volume_names

  if ! volume_names="$(
    docker volume ls --quiet \
      --filter "label=com.docker.compose.project=code-quest" \
      --filter "label=com.docker.compose.volume=codequest-data" 2>/dev/null
  )"; then
    fail "기존 학습 데이터 볼륨을 확인하지 못했습니다. Docker Desktop 상태와 접근 권한을 확인해 주세요."
  fi
  [ -n "$volume_names" ]
}

replace_env_value() {
  local file="$1"
  local key="$2"
  local value="$3"
  local temporary_file
  local value_file

  temporary_file="$(mktemp "${file}.tmp.XXXXXX")" ||
    fail "환경 설정을 수정할 임시 파일을 만들 수 없습니다."
  value_file="$(mktemp "${file}.value.XXXXXX")" || {
    rm -f "$temporary_file"
    fail "보안 값을 전달할 임시 파일을 만들 수 없습니다."
  }
  chmod 600 "$value_file" ||
    fail "보안 임시 파일의 권한을 보호하지 못했습니다."
  printf '%s' "$value" >"$value_file" ||
    fail "보안 임시 파일을 기록하지 못했습니다."

  if ! awk -v key="$key" -v value_file="$value_file" '
    BEGIN {
      if ((getline value < value_file) < 0) {
        exit 2
      }
      close(value_file)
    }
    {
      line = $0
      probe = line
      sub(/\r$/, "", probe)
      if (probe ~ "^[[:space:]]*" key "[[:space:]]*=") {
        print key "=" value
        found = 1
      } else {
        print line
      }
    }
    END {
      if (!found) {
        print key "=" value
      }
    }
  ' "$file" >"$temporary_file"; then
    rm -f "$temporary_file" "$value_file"
    fail "환경 설정의 $key 값을 갱신하지 못했습니다."
  fi
  rm -f "$value_file"

  chmod 600 "$temporary_file" ||
    fail "새 환경 설정 파일의 권한을 보호하지 못했습니다."
  mv "$temporary_file" "$file" ||
    fail "새 환경 설정 파일을 저장하지 못했습니다."
}

create_env_file() {
  local work_file
  local postgres_password
  local java_token
  local javascript_token

  [ -r "$ENV_EXAMPLE_FILE" ] ||
    fail ".env.example 파일이 없습니다. 프로젝트 파일을 다시 내려받아 주세요."

  postgres_password="$(generate_secret)" ||
    fail "안전한 임의 비밀번호를 생성할 수 없습니다. OpenSSL을 설치한 뒤 다시 시도해 주세요."
  java_token="$(generate_secret)" ||
    fail "Java 실행기용 보안 토큰을 생성할 수 없습니다."
  javascript_token="$(generate_secret)" ||
    fail "JavaScript 실행기용 보안 토큰을 생성할 수 없습니다."

  while [ "$javascript_token" = "$java_token" ]; do
    javascript_token="$(generate_secret)" ||
      fail "서로 다른 실행기용 보안 토큰을 생성할 수 없습니다."
  done

  work_file="$(mktemp "${ENV_FILE}.new.XXXXXX")" ||
    fail ".env 파일을 만들 임시 공간을 준비하지 못했습니다."
  cp "$ENV_EXAMPLE_FILE" "$work_file" ||
    fail ".env.example 파일을 복사하지 못했습니다."
  chmod 600 "$work_file" ||
    fail "환경 설정 파일의 권한을 보호하지 못했습니다."

  replace_env_value "$work_file" "POSTGRES_PASSWORD" "$postgres_password"
  replace_env_value "$work_file" "JAVA_RUNNER_TOKEN" "$java_token"
  replace_env_value "$work_file" "JAVASCRIPT_RUNNER_TOKEN" "$javascript_token"

  mv "$work_file" "$ENV_FILE" ||
    fail ".env 파일을 프로젝트 폴더에 저장하지 못했습니다."
  chmod 600 "$ENV_FILE" ||
    fail ".env 파일의 권한을 보호하지 못했습니다."

  print_info "안전한 비밀번호와 토큰을 포함한 .env 파일을 자동 생성했습니다."
}

repair_runner_tokens_if_needed() {
  local postgres_password
  local java_token
  local javascript_token
  local repair_postgres=0
  local repair_java=0
  local repair_javascript=0
  local existing_volume=0
  local backup_file
  local backup_suffix=0
  local new_token

  postgres_password="$(read_env_value "POSTGRES_PASSWORD")"
  java_token="$(read_env_value "JAVA_RUNNER_TOKEN")"
  javascript_token="$(read_env_value "JAVASCRIPT_RUNNER_TOKEN")"

  data_volume_exists && existing_volume=1
  if ! password_is_valid "$postgres_password"; then
    if [ "$existing_volume" -eq 1 ]; then
      print_warning "기존 PostgreSQL 볼륨과의 호환성을 위해 현재 비밀번호는 유지합니다. 새 설치라면 START_HERE.md의 초기화 안내를 확인해 주세요."
    else
      repair_postgres=1
    fi
  fi

  token_is_valid "$java_token" || repair_java=1
  token_is_valid "$javascript_token" || repair_javascript=1

  if [ "$repair_java" -eq 0 ] &&
    [ "$repair_javascript" -eq 0 ] &&
    [ "$java_token" = "$javascript_token" ]; then
    repair_javascript=1
  fi

  if [ "$repair_postgres" -eq 0 ] &&
    [ "$repair_java" -eq 0 ] &&
    [ "$repair_javascript" -eq 0 ]; then
    chmod 600 "$ENV_FILE" ||
      fail ".env 파일의 권한을 보호하지 못했습니다."
    print_info "기존 .env 설정이 유효하여 그대로 사용합니다."
    return
  fi

  backup_file="${ENV_FILE}.backup-$(date '+%Y%m%d-%H%M%S')"
  while [ -e "$backup_file" ]; do
    backup_suffix=$((backup_suffix + 1))
    backup_file="${ENV_FILE}.backup-$(date '+%Y%m%d-%H%M%S').${backup_suffix}"
  done

  cp "$ENV_FILE" "$backup_file" ||
    fail "기존 .env 파일을 백업하지 못해 자동 수정을 중단했습니다."
  chmod 600 "$backup_file" ||
    fail ".env 백업 파일의 권한을 보호하지 못했습니다."

  if [ "$repair_postgres" -eq 1 ]; then
    postgres_password="$(generate_secret)" ||
      fail "PostgreSQL 비밀번호를 생성할 수 없습니다."
    replace_env_value "$ENV_FILE" "POSTGRES_PASSWORD" "$postgres_password"
  fi

  if [ "$repair_java" -eq 1 ]; then
    new_token="$(generate_secret)" ||
      fail "Java 실행기용 보안 토큰을 생성할 수 없습니다."
    while [ "$repair_javascript" -eq 0 ] && [ "$new_token" = "$javascript_token" ]; do
      new_token="$(generate_secret)" ||
        fail "서로 다른 실행기용 보안 토큰을 생성할 수 없습니다."
    done
    replace_env_value "$ENV_FILE" "JAVA_RUNNER_TOKEN" "$new_token"
    java_token="$new_token"
  fi

  if [ "$repair_javascript" -eq 1 ]; then
    new_token="$(generate_secret)" ||
      fail "JavaScript 실행기용 보안 토큰을 생성할 수 없습니다."
    while [ "$new_token" = "$java_token" ]; do
      new_token="$(generate_secret)" ||
        fail "서로 다른 실행기용 보안 토큰을 생성할 수 없습니다."
    done
    replace_env_value "$ENV_FILE" "JAVASCRIPT_RUNNER_TOKEN" "$new_token"
  fi

  chmod 600 "$ENV_FILE" ||
    fail ".env 파일의 권한을 보호하지 못했습니다."

  print_info "누락되었거나 안전하지 않은 로컬 비밀번호와 실행기 토큰을 자동으로 보정했습니다."
  print_info "기존 설정 백업: $(basename "$backup_file")"
}

command -v docker >/dev/null 2>&1 ||
  fail "Docker를 찾을 수 없습니다. Docker Desktop 또는 Docker Engine을 먼저 설치해 주세요."

docker compose version >/dev/null 2>&1 ||
  fail "Docker Compose를 사용할 수 없습니다. Compose가 포함된 최신 Docker를 설치해 주세요."

docker info >/dev/null 2>&1 ||
  fail "Docker가 실행 중이 아니거나 현재 사용자에게 접근 권한이 없습니다. Docker Desktop을 실행한 뒤 다시 시도해 주세요."

docker compose up --help 2>/dev/null | grep -q -- '--wait' ||
  fail "현재 Docker Compose가 자동 상태 대기를 지원하지 않습니다. Docker Desktop을 최신 버전으로 업데이트해 주세요."

unset POSTGRES_DB POSTGRES_USER POSTGRES_PASSWORD JAVA_RUNNER_TOKEN JAVASCRIPT_RUNNER_TOKEN

if [ -L "$ENV_FILE" ]; then
  fail ".env가 심볼릭 링크입니다. 외부 설정을 덮어쓰지 않도록 일반 파일만 사용할 수 있습니다."
fi

if [ -e "$ENV_FILE" ] && [ ! -f "$ENV_FILE" ]; then
  fail ".env 경로가 일반 파일이 아닙니다. 해당 경로를 확인해 주세요."
fi

if [ ! -e "$ENV_FILE" ]; then
  if data_volume_exists; then
    fail ".env는 없지만 기존 학습 데이터 볼륨이 남아 있습니다. 기존 .env 또는 .env.backup-*을 복원하세요. 진도가 필요 없다면 README의 볼륨 초기화 안내를 확인해 주세요."
  fi
  create_env_file
else
  [ -r "$ENV_FILE" ] || fail ".env 파일을 읽을 수 없습니다. 파일 권한을 확인해 주세요."
  repair_runner_tokens_if_needed
fi

print_info "Docker 설정을 확인합니다."
if ! docker compose config --quiet; then
  fail "Docker Compose 설정이 올바르지 않습니다. 위 오류 내용을 확인해 주세요."
fi

print_info "필요한 이미지를 빌드하고 서비스를 시작합니다. 처음에는 몇 분 걸릴 수 있습니다."
if ! docker compose up --detach --build --wait; then
  fail "서비스를 모두 시작하지 못했습니다. 위 Docker 로그를 확인해 주세요."
fi

printf '\nCode Quest가 준비되었습니다: %s\n' "$APP_URL"

if [ "${CODE_QUEST_NO_OPEN:-0}" != "1" ]; then
  if command -v open >/dev/null 2>&1; then
    open "$APP_URL" >/dev/null 2>&1 ||
      print_warning "브라우저를 자동으로 열지 못했습니다. $APP_URL 에 직접 접속해 주세요."
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$APP_URL" >/dev/null 2>&1 ||
      print_warning "브라우저를 자동으로 열지 못했습니다. $APP_URL 에 직접 접속해 주세요."
  else
    print_warning "브라우저 자동 열기 도구가 없습니다. $APP_URL 에 직접 접속해 주세요."
  fi
fi
