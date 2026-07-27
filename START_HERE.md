# Code Quest 처음 실행하기

Code Quest는 파일을 더블클릭해 개별 프로그램을 설치하는 방식이 아니라 Docker로 전체 서비스를
함께 실행합니다. 사용자가 token이나 `.env`를 직접 만들 필요는 없습니다.

## 1. Docker Desktop 실행

[Docker Desktop](https://www.docker.com/products/docker-desktop/)을 설치하고 완전히 실행될 때까지
기다립니다. 처음 빌드할 때는 Chromium과 Java 이미지를 내려받으므로 인터넷 연결과 여유 디스크
공간이 필요합니다.

## 2. 시작 파일 실행

- macOS: `start.command` 더블클릭
- Windows: `start.cmd` 더블클릭
- Linux: 터미널에서 `./start.sh`

macOS에서 더블클릭이 차단되거나 macOS·Linux에서 실행 권한 오류가 나면 프로젝트 폴더의
터미널에서 실행합니다.

```bash
bash start.sh
```

시작 파일은 안전한 로컬 비밀번호와 서로 다른 runner token을 `.env`에 자동 생성하고, Docker
구성을 검사한 뒤 모든 서비스가 준비될 때까지 기다립니다. 성공하면 브라우저에서
<http://localhost:3000>을 자동으로 엽니다.

## 종료하기

프로젝트 폴더의 터미널에서 다음 명령을 실행합니다.

```bash
docker compose down
```

이 명령은 학습 진도를 보존합니다. `docker compose down --volumes`는 저장된 학습 진도를 모두
삭제하므로 완전히 초기화하려는 경우에만 사용하세요.

## 문제가 발생할 때

- “Docker를 찾을 수 없습니다”: Docker Desktop을 설치한 뒤 새 터미널에서 다시 실행합니다.
- “Docker가 실행 중이 아닙니다”: Docker Desktop을 열고 엔진 준비가 끝난 뒤 다시 실행합니다.
- 기존 token 오류: 시작 파일이 `.env`를 백업하고 잘못된 token만 자동 교체합니다.
- “기존 학습 데이터 볼륨이 남아 있습니다”: 기존 `.env`나 `.env.backup-*`을 복원합니다.
- 서비스 시작 실패: Docker Desktop에 최소 4GB 이상의 메모리를 할당하고 다시 실행합니다.

자세한 구조와 수동 실행 방법은 [`README.md`](README.md)를 참고하세요.
