# Code Quest 초보자 실행 설명서

Docker를 처음 사용해도 괜찮습니다. 이 설명서의 순서대로 진행하면 됩니다.

> **한 줄 요약:** Docker Desktop을 설치하고 실행한 뒤, 압축을 푼 Code Quest 폴더에서
> macOS는 `start.command`, Windows는 `start.cmd`를 더블클릭하면 됩니다.

Code Quest가 요구하는 비밀번호, token과 `.env` 설정 파일은 시작 프로그램이 자동으로
만듭니다. 사용자가 값을 찾아서 입력하거나 Java, Node.js, PostgreSQL을 따로 설치할 필요가
없습니다.

> **이미 Code Quest를 사용 중인가요?** 새 ZIP을 기존 폴더 위에 덮어쓰지 마세요. 기존
> 설정과 학습 데이터의 손실 위험을 줄이려면 [`UPDATE.md`](UPDATE.md)의 안전 업데이트 절차를 먼저
> 확인하세요.

## 1. Docker가 무엇인가요?

Code Quest는 화면, 서버, 데이터베이스와 여러 코드 채점기로 구성되어 있습니다. Docker는 이
프로그램들을 컴퓨터 안의 서로 분리된 작은 실행 공간에 한꺼번에 준비해 주는 도구입니다.

이 설명서에서는 어려운 Docker 명령을 배울 필요가 없습니다. 다음 세 가지만 기억하면 됩니다.

1. Code Quest를 사용하기 전에 **Docker Desktop을 먼저 실행**합니다.
2. Code Quest 폴더에 있는 **시작 파일을 실행**합니다.
3. 사용이 끝나면 Docker Desktop에서 Code Quest를 중지하거나 종료 명령을 사용합니다.

Code Quest는 내 컴퓨터의 <http://localhost:3000>에서 실행됩니다. 별도의 클라우드 서버를
만들거나 서버 비용을 낼 필요는 없습니다.

## 2. 시작 전에 준비할 것

- 인터넷 연결: 첫 실행에서 필요한 Docker 이미지를 내려받습니다.
- 여유 저장 공간: Docker 이미지와 학습 데이터용으로 **8GB 이상을 권장**합니다.
- 메모리: Docker Desktop에 **4GB 이상을 권장**합니다.
- Code Quest 압축 파일: 반드시 압축을 완전히 풀어서 사용합니다.
- Docker Desktop: macOS·Windows에서는 아래 절차에 따라 설치합니다.

첫 실행은 여러 이미지를 내려받고 프로그램을 빌드하므로 컴퓨터와 인터넷 속도에 따라 몇 분
이상 걸릴 수 있습니다. 이후 실행은 저장된 Docker 캐시를 사용하므로 보통 더 빠릅니다.

## 3. Docker Desktop 설치

이미 Docker Desktop을 사용하고 있다면 [4. Docker가 준비되었는지 확인](#4-docker가-준비되었는지-확인)으로
이동하세요.

### macOS

1. [Docker Desktop for Mac 공식 설치 페이지](https://docs.docker.com/desktop/setup/install/mac-install/)를
   엽니다.
2. 내 Mac에 맞는 설치 파일을 내려받습니다.
   - Apple M1·M2·M3·M4 계열: **Apple silicon**
   - 오래된 Intel Mac: **Intel chip**
   - 모르겠다면 화면 왼쪽 위 ` → 이 Mac에 관하여`에서 `칩` 또는 `프로세서`를 확인합니다.
3. 내려받은 `Docker.dmg`를 열고 Docker 아이콘을 `Applications` 폴더로 옮깁니다.
4. 응용 프로그램 폴더에서 **Docker**를 실행합니다.
5. 처음 표시되는 이용 약관과 권한 안내를 확인하고 권장 설정으로 설치를 마칩니다.

### Windows

1. [Docker Desktop for Windows 공식 설치 페이지](https://docs.docker.com/desktop/setup/install/windows-install/)를
   엽니다.
2. 설치 파일을 내려받아 `Docker Desktop Installer.exe`를 실행합니다.
3. 일반적인 개인 PC에서는 기본값인 **WSL 2 방식**을 그대로 사용합니다.
4. 설치 프로그램의 안내를 끝까지 진행합니다. Windows가 재시작을 요구하면 재시작합니다.
5. 시작 메뉴에서 **Docker Desktop**을 실행합니다.

WSL 관련 오류가 표시되면 Docker 설치 화면의 안내에 따라 WSL을 업데이트한 뒤 Windows를
재시작하세요. 회사나 학교에서 관리하는 PC는 가상화 또는 프로그램 설치가 제한될 수 있으므로
관리자에게 Docker Desktop 사용 가능 여부를 먼저 확인해야 할 수 있습니다.

### Linux

[Docker Desktop for Linux 공식 설치 안내](https://docs.docker.com/desktop/setup/install/linux/)에
따라 배포판에 맞게 설치합니다. 이미 Docker Engine을 사용한다면 Docker Compose V2가 함께
설치되어 있는지 다음 명령으로 확인합니다.

```bash
docker compose version
```

## 4. Docker가 준비되었는지 확인

1. Docker Desktop을 실행합니다.
2. 메뉴 막대나 작업 표시줄에 고래 모양 Docker 아이콘이 나타나는지 확인합니다.
3. Docker Desktop 화면이 `Engine running` 또는 실행 중 상태가 될 때까지 기다립니다.

Docker Desktop 창을 열었다고 바로 준비되는 것은 아닙니다. 처음 실행하거나 컴퓨터를 재부팅한
직후에는 엔진이 준비되는 데 시간이 조금 걸릴 수 있습니다.

Code Quest는 Docker Hub 계정 token이나 Code Quest token을 사용자에게 요구하지 않습니다.
프로젝트 내부 서비스끼리 사용하는 token은 시작 파일이 자동으로 생성합니다.

## 5. Code Quest 압축 풀기

압축 파일 안에서 시작 파일을 바로 실행하면 안 됩니다.

### macOS

`code-quest.zip`을 더블클릭합니다. 같은 위치에 `code-quest` 폴더가 만들어집니다.

### Windows

`code-quest.zip`을 마우스 오른쪽 버튼으로 누르고 `압축 풀기` 또는 `모두 추출`을 선택합니다.

압축을 푼 폴더 안에 최소한 다음 파일이 함께 있어야 합니다.

```text
code-quest/
├── START_HERE.md
├── start.command
├── start.cmd
├── start.ps1
├── start.sh
├── docker-compose.yml
├── frontend/
└── backend/
```

시작 파일 하나만 바탕화면으로 옮기지 마세요. 시작 파일은 나머지 프로젝트 파일과 같은 폴더
구조 안에 있어야 합니다.

## 6. Code Quest 실행

### macOS에서 실행

1. Docker Desktop이 실행 중인지 확인합니다.
2. 압축을 푼 `code-quest` 폴더를 엽니다.
3. `start.command`를 더블클릭합니다.
4. 터미널 창이 열리면 닫지 말고 완료될 때까지 기다립니다.

macOS가 파일 실행을 막거나 권한 오류가 표시되면 다음 방법을 사용합니다.

1. macOS의 **터미널** 앱을 엽니다.
2. `cd `를 입력합니다. `cd` 뒤에 공백이 하나 있어야 합니다.
3. `code-quest` 폴더를 터미널 창으로 끌어다 놓고 Enter를 누릅니다.
4. 다음 명령을 입력합니다.

```bash
bash start.sh
```

### Windows에서 실행

1. Docker Desktop이 실행 중인지 확인합니다.
2. 압축을 푼 `code-quest` 폴더를 엽니다.
3. `start.cmd`를 더블클릭합니다.
4. 명령 프롬프트 창이 열리면 닫지 말고 완료될 때까지 기다립니다.

더블클릭한 창이 바로 닫히거나 실행되지 않으면 다음 방법을 사용합니다.

1. 파일 탐색기에서 `code-quest` 폴더를 엽니다.
2. 위쪽 주소 표시줄을 클릭하고 `cmd`를 입력한 뒤 Enter를 누릅니다.
3. 열린 창에 다음 명령을 입력합니다.

```bat
start.cmd
```

### Linux에서 실행

`code-quest` 폴더에서 터미널을 열고 다음 명령을 실행합니다.

```bash
bash start.sh
```

## 7. 첫 실행에서 일어나는 일

시작 파일이 다음 작업을 자동으로 수행합니다.

1. Docker와 Docker Compose가 설치되고 실행 중인지 확인합니다.
2. `.env`가 없으면 안전한 데이터베이스 비밀번호와 서로 다른 실행기 token을 생성합니다.
3. 프로젝트 설정에 빠진 값이 없는지 검사합니다.
4. 화면, 서버, 데이터베이스와 채점 서비스를 빌드하고 실행합니다.
5. 모든 서비스가 정상 상태가 될 때까지 기다립니다.
6. 기본 브라우저에서 <http://localhost:3000>을 엽니다.

다음 문구가 나오면 정상적으로 준비된 것입니다.

```text
Code Quest가 준비되었습니다: http://localhost:3000
```

브라우저가 자동으로 열리지 않으면 Chrome, Safari, Edge 또는 Firefox 주소창에
`http://localhost:3000`을 직접 입력하세요.

첫 실행 중에는 다음 현상이 나타날 수 있으며 정상입니다.

- 영어로 된 Docker 다운로드·빌드 로그가 많이 출력됩니다.
- 진행률이 잠시 멈춘 것처럼 보여도 큰 이미지를 내려받는 중일 수 있습니다.
- CPU 사용량이 높아지거나 컴퓨터 팬이 작동할 수 있습니다.

오류 문구가 표시되지 않았다면 터미널이나 명령 프롬프트 창을 강제로 닫지 말고 기다려 주세요.
인터넷이 끊겨 실행이 중단되어도 연결을 복구한 뒤 같은 시작 파일을 다시 실행하면 대부분 이어서
진행됩니다.

## 8. 학습 시작하기

브라우저에서 Code Quest가 열리면 별도 회원가입 없이 바로 사용할 수 있습니다.

- 첫 화면: `HTML Quest → 문서 구조 → 1번 문제`
- 학습 순서: `HTML → CSS → JavaScript → Java → Algorithm`
- 작성 중인 답안 초안: 현재 브라우저에 자동 저장
- 정답 여부와 시도 횟수: 로컬 PostgreSQL 데이터에 저장
- 코드 편집기: 줄 번호, 문법 강조, 자동 들여쓰기와 Tab·Shift+Tab 지원
- 빠른 진행: `Ctrl/⌘ + Enter`로 채점하고 정답 확인 후 다시 눌러 다음 문제로 이동

창을 닫아도 학습 진도는 바로 삭제되지 않습니다.

## 9. 종료하기

브라우저 창만 닫으면 화면만 닫히고 Docker 서비스는 계속 실행될 수 있습니다.

### 가장 쉬운 종료 방법

Docker Desktop의 `Containers` 화면에서 `code-quest` 항목의 정지 버튼을 누릅니다. Docker
Desktop 자체를 종료해도 Code Quest는 함께 중지됩니다.

### 명령으로 안전하게 종료

Code Quest 폴더에서 터미널 또는 명령 프롬프트를 열고 다음 명령을 실행합니다.

```bash
docker compose down
```

이 명령은 실행 중인 서비스를 종료하지만 **학습 진도는 보존**합니다.

## 10. 다시 실행하기

1. Docker Desktop을 실행하고 엔진이 준비될 때까지 기다립니다.
2. macOS는 `start.command`, Windows는 `start.cmd`, Linux는 `bash start.sh`를 다시 실행합니다.
3. 브라우저에서 <http://localhost:3000>을 엽니다.

정상적인 `.env`와 기존 학습 데이터는 그대로 재사용됩니다. 매번 token을 새로 입력할 필요가
없습니다.

## 11. 주의: 학습 기록 초기화

다음 명령은 PostgreSQL 데이터 볼륨에 기록된 정답 여부와 시도 횟수를 삭제합니다.

```bash
docker compose down --volumes
```

단순 종료에는 이 명령을 사용하지 마세요. 처음부터 다시 시작하거나 손상된 새 설치를 완전히
초기화하려는 경우에만 사용합니다. 브라우저에 자동 저장된 답안 초안과 마지막으로 열었던 문제는
브라우저 데이터이므로 이 명령만으로는 삭제되지 않을 수 있습니다.

`.env`만 삭제하고 데이터 볼륨을 남겨 두면 기존 데이터베이스 비밀번호를 찾을 수 없어 시작
프로그램이 안전을 위해 중단됩니다. 진도를 유지하려면 `.env`와 `.env.backup-*` 파일을 임의로
삭제하지 마세요.

## 12. 자주 발생하는 문제

### “Docker를 찾을 수 없습니다”

- Docker Desktop이 설치되어 있는지 확인합니다.
- 설치 직후였다면 열려 있던 터미널을 닫고 새로 연 뒤 다시 실행합니다.
- Docker Desktop을 최신 버전으로 업데이트합니다.

### “Docker Compose가 자동 상태 대기를 지원하지 않습니다”

설치된 Docker Compose가 오래된 버전입니다. Docker Desktop을 최신 버전으로 업데이트하고
컴퓨터에서 Docker Desktop을 다시 실행한 뒤 Code Quest를 시작하세요.

### “Docker가 실행 중이 아닙니다” 또는 “Docker 엔진에 연결할 수 없습니다”

- Docker Desktop을 직접 실행합니다.
- `Engine running` 상태가 될 때까지 기다린 뒤 Code Quest 시작 파일을 다시 실행합니다.
- Docker Desktop이 멈춰 있다면 종료 후 다시 실행합니다.

### macOS에서 “권한이 없습니다”라고 나옵니다

`start.command` 대신 터미널에서 다음 명령을 실행합니다.

```bash
bash start.sh
```

### Windows에서 WSL 관련 오류가 나옵니다

- Windows Update를 적용합니다.
- Docker Desktop 설치 안내에 따라 WSL 2를 설치하거나 업데이트합니다.
- 작업 관리자 `성능 → CPU`에서 가상화가 활성화되어 있는지 확인합니다.
- 회사·학교 PC라면 관리자 정책으로 가상화가 차단되었는지 문의합니다.

### “port is already in use” 또는 포트 충돌이 나옵니다

이미 Code Quest가 실행 중일 수 있으므로 먼저 <http://localhost:3000>을 열어 봅니다. 다른
프로그램이나 Docker 프로젝트가 3000번 또는 8080번 포트를 사용 중이라면 Docker Desktop의
`Containers` 화면에서 해당 프로젝트를 중지한 뒤 다시 실행합니다.

### token 또는 `.env` 오류가 나옵니다

token을 직접 입력할 필요가 없습니다. `docker compose up`을 직접 실행하지 말고 운영체제에 맞는
`start.command`, `start.cmd` 또는 `bash start.sh`를 실행하세요.

시작 프로그램은 잘못된 runner token을 발견하면 기존 `.env`를 `.env.backup-*`으로 백업하고
필요한 값만 자동 복구합니다.

### “.env는 없지만 기존 학습 데이터 볼륨이 남아 있습니다”

기존 데이터베이스를 만든 비밀번호가 사라진 상태입니다. 진도를 유지하려면 원래 사용하던 `.env`
또는 가장 최근의 `.env.backup-*`을 복원하세요. 진도가 필요 없는 경우에만 Docker Desktop의
`Volumes` 화면에서 `code-quest_codequest-data` 볼륨을 삭제하고 시작 파일을 다시 실행합니다.

### 브라우저에 “사이트에 연결할 수 없음”이 표시됩니다

1. 시작 창에 `Code Quest가 준비되었습니다` 문구가 있었는지 확인합니다.
2. Docker Desktop에서 `code-quest` 컨테이너들이 실행 중인지 확인합니다.
3. Code Quest 시작 파일을 한 번 더 실행합니다.
4. 주소가 `http://localhost:3000`인지 확인합니다. `https`가 아닙니다.

### 실행이 너무 오래 걸리거나 중간에 실패합니다

- 인터넷 연결과 디스크 여유 공간을 확인합니다.
- Docker Desktop 설정에서 사용할 수 있는 메모리가 4GB 이상인지 확인합니다.
- Docker Desktop을 다시 실행한 뒤 Code Quest 시작 파일을 다시 실행합니다.
- 첫 시도가 중단되어도 이미 내려받은 파일은 대부분 다시 사용됩니다.

### 그래도 해결되지 않습니다

Code Quest 폴더의 터미널에서 다음 명령을 실행하고 결과를 개발자에게 전달합니다.

```bash
docker compose ps
docker compose logs --tail=100
```

`.env` 파일에는 로컬 비밀번호와 token이 있으므로 다른 사람에게 보내거나 화면을 캡처해
공유하지 마세요.

## 13. 자주 묻는 질문

### Git이나 GitHub 계정이 필요한가요?

아니요. 전달받은 ZIP을 압축 해제해서 실행할 때는 Git과 GitHub 계정이 필요하지 않습니다.

### Java나 PostgreSQL을 따로 설치해야 하나요?

아니요. 필요한 Java, PostgreSQL, Node.js, Chromium과 Deno 실행 환경은 Docker가 준비합니다.

### 실행할 때 서버 비용이 발생하나요?

Code Quest는 내 컴퓨터에서 실행되므로 별도의 클라우드 서버 비용은 발생하지 않습니다. 첫 실행
시 Docker 이미지를 내려받으므로 인터넷 데이터 사용량은 발생할 수 있습니다.

### Docker나 Code Quest에 로그인해야 하나요?

Code Quest는 회원가입이나 로그인이 필요하지 않고 Code Quest용 token도 입력하지 않습니다.
Docker Desktop 자체의 최초 이용 약관이나 조직 정책 안내가 표시될 수 있지만, Code Quest는
별도의 Docker Hub 계정 정보나 token을 요구하지 않습니다.

### 프로젝트 폴더를 다른 사람에게 그대로 보내도 되나요?

한 번 실행한 폴더에는 개인 학습 데이터와 연결되는 `.env`가 만들어집니다. 다른 사람에게는
실행한 폴더를 다시 압축하기보다, 개발자가 만든 깨끗한 `code-quest.zip` 원본을 전달하세요.

### 컴퓨터를 재부팅하면 진도가 사라지나요?

아니요. Docker 볼륨을 직접 삭제하거나 `docker compose down --volumes`를 실행하지 않으면 서버에
저장된 정답 여부와 시도 횟수가 유지됩니다. 브라우저의 답안 초안도 브라우저 데이터를 지우지
않는 한 유지됩니다.

## 실행 전 최종 체크리스트

- [ ] `code-quest.zip`의 압축을 완전히 풀었다.
- [ ] Docker Desktop을 설치했다.
- [ ] Docker Desktop이 `Engine running` 상태다.
- [ ] 시작 파일을 다른 폴더로 따로 옮기지 않았다.
- [ ] macOS는 `start.command`, Windows는 `start.cmd`를 실행했다.
- [ ] 첫 실행의 다운로드와 빌드가 끝날 때까지 기다렸다.
- [ ] 브라우저에서 <http://localhost:3000>을 열었다.

프로젝트 구조, 수동 실행과 개발자용 테스트 방법은 [`README.md`](README.md)를 참고하세요.
