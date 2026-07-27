#!/usr/bin/env bash

script_dir="$(CDPATH= cd -P -- "$(dirname -- "${BASH_SOURCE[0]}")" 2>/dev/null && pwd)"

if [ -z "$script_dir" ]; then
  printf 'Code Quest 실행 오류: 프로젝트 폴더를 확인할 수 없습니다.\n' >&2
  printf 'Enter 키를 누르면 창이 닫힙니다...'
  read -r _
  exit 1
fi

if "$script_dir/start.sh"; then
  exit 0
else
  status=$?
fi

printf '\n실행에 실패했습니다. 위 안내를 확인한 뒤 다시 시도해 주세요.\n' >&2
printf 'Enter 키를 누르면 창이 닫힙니다...'
read -r _
exit "$status"
