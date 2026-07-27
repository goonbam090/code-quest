# Code Quest Agent Guide

이 파일은 저장소 전체에 적용되는 지속 지침이다. 변경 범위에 더 가까운 디렉터리에 별도의
`AGENTS.md` 또는 `AGENTS.override.md`가 있으면 그 지침을 함께 따르고, 충돌할 때는 더 가까운
지침을 우선한다.

## Project priorities

Code Quest는 HTML, CSS, JavaScript, Java와 알고리즘을 직접 실행하며 학습하는 로컬 우선
오픈소스 플랫폼이다. 변경할 때 다음 순서를 우선한다.

1. 채점 정확성과 학습 내용의 정확성
2. 신뢰하지 않는 사용자 코드에 대한 격리와 비밀값 보호
3. macOS, Windows, Linux에서의 한 번 실행 경험
4. 기존 학습 진도와 공개 API 계약의 호환성
5. 읽기 쉬운 구현과 재현 가능한 빌드

## Repository map

- `frontend/`: React, TypeScript, Vite, CodeMirror UI
- `backend/`: Java 21, Spring Boot, JPA, Flyway API
- `renderer/`: Playwright/Chromium 기반 HTML·CSS 채점기
- `java-runner/`: 격리된 Java 컴파일·실행 서비스
- `javascript-runner/`: 격리된 Deno JavaScript 실행 서비스
- `backend/src/main/resources/problems/`: 문제 카탈로그의 기준 JSON
- `tools/`: 카탈로그, 기준 답안, 채점 계약과 릴리스 감사 도구
- `start.*`, `start.sh`: 운영체제별 한 번 실행 진입점
- `docker-compose.yml`: 서비스 격리, 자원 제한과 네트워크 경계
- `.github/workflows/ci.yml`: CI 검증 절차의 기준

구조나 보안 경계를 수정하기 전에는 `README.md`, `SECURITY.md`, `docker-compose.yml`과 관련
서비스 테스트를 먼저 읽는다. 문제 콘텐츠를 수정할 때는 대상 JSON과
`tools/audit-problems.mjs`의 계약을 먼저 확인한다.

## Working agreements

- 작업 시작 시 `git status --short`로 기존 변경을 확인하고 사용자 변경을 보존한다.
- 요청 범위에 필요한 최소 변경을 한다. 관련 없는 리팩터링이나 버전 업데이트를 섞지 않는다.
- 기존 코드와 테스트의 패턴을 우선하고, 새 프로덕션 의존성은 필요성과 대안을 설명한 뒤 추가한다.
- 동작이 바뀌면 같은 변경에 회귀 테스트를 추가하거나 수정한다.
- `.env`, `node_modules/`, `dist/`, `target/`, `coverage/`, `code-quest.zip` 같은 생성물을
  커밋하지 않는다.
- 실제 토큰, 비밀번호, 사용자 제출 코드나 민감한 로그를 출력하거나 문서·테스트 fixture에
  넣지 않는다. `.env.example`에는 형식과 안전한 예시만 둔다.
- Node 패키지의 정확한 버전과 lockfile, Docker 이미지 digest, GitHub Actions commit SHA
  고정 방식을 유지한다. 의도적인 업데이트가 아니면 고정을 완화하지 않는다.
- 시작 스크립트를 변경하면 Unix와 Windows 흐름의 의미가 계속 일치하는지 확인한다.
- 커밋, push, PR 생성, merge와 릴리스 발행은 사용자가 요청했을 때만 수행한다.

## Git publishing

- `main`은 PR merge 결과만 받는 통합 브랜치다. `main`에 직접 커밋하거나 직접 push하지
  않는다.
- 모든 변경은 최신 `origin/main`에서 분기한 `dev/<짧은-설명>` 기능 브랜치에서 작업하고
  커밋한다.
- 커밋 메시지는 한글로 작성하고 변경 의도를 짧고 분명하게 표현한다. 코드 식별자, 파일명과
  고유 기술명은 필요한 경우 원문을 유지할 수 있다.
- 커밋 요청은 push 권한까지 의미하지 않는다. 사용자가 push를 명시한 경우에만 원격 저장소를
  변경한다.
- 변경이 섞인 작업 트리에서는 관련 파일만 명시적으로 stage하고 `.env`, 생성물, 사용자 로컬
  지침처럼 범위 밖 파일을 함께 커밋하지 않는다.
- push 전에 현재 브랜치, tracking 원격과 원격 변경 여부를 확인한다.
- `main` 반영은 기능 브랜치를 원격에 push한 뒤 만든 GitHub PR을 통해서만 수행한다.
- 필수 CI 검사가 모두 통과한 뒤 PR을 merge한다. 검사가 실패했거나 진행 중이면 merge하지
  않는다.
- push 후 CI가 시작되면 가능할 때 완료 상태까지 확인하고, 실패하거나 확인하지 못한 검증을
  성공한 것처럼 보고하지 않는다.

## Security and grading invariants

사용자가 제출한 Java, JavaScript, HTML과 CSS는 모두 신뢰하지 않는 입력이다.

- runner와 renderer의 비루트 사용자, 읽기 전용 루트 파일시스템, 제한된 `tmpfs`,
  capability 제거, `no-new-privileges`, CPU·메모리·PID·출력·시간 제한을 약화하지 않는다.
- `renderer`, `java-runner`, `javascript-runner`의 포트를 호스트에 공개하지 않는다.
  서로 분리된 internal 네트워크를 유지하고 백엔드만 필요한 네트워크에 참여시킨다.
- `JAVA_RUNNER_TOKEN`과 `JAVASCRIPT_RUNNER_TOKEN`은 서로 다른 32바이트 이상의 값이어야
  한다. 토큰을 로그, 오류 응답이나 공개 API에 포함하지 않는다.
- JavaScript 자식 실행의 Deno 권한 거부 플래그와 Java 실행의 소스 계약 검사·권한 제한을
  우회하거나 제거하지 않는다.
- 원격 채점 호출은 데이터베이스 트랜잭션 밖에서 수행한다. 채점 완료 후 진도 기록만 짧은
  트랜잭션에서 처리하며 동시 제출의 시도 횟수와 최초 정답 기록 원자성을 유지한다.
- 공개 문제 API는 기준 답안과 전체 테스트 정의를 반환하지 않아야 한다. 저장소에 학습 콘텐츠가
  공개되어 있다는 사실은 의도된 동작이며 안티치팅 보안 경계로 취급하지 않는다.
- Docker 컨테이너를 인터넷 공개 멀티테넌트 서비스의 최종 격리 경계라고 주장하지 않는다.
- 학습 진도를 삭제하는 `docker compose down --volumes`는 사용자가 명시적으로 요청하거나
  버려도 되는 임시 CI 환경임이 확실한 경우에만 실행한다.

보안 경계를 변경하는 작업은 정상 입력, 악성 입력, 시간 초과, 과도한 출력, 인증 실패와 서비스
중단 경로를 함께 검토한다.

## Learning content invariants

- 문제를 풀기 전에 공개되는 `learning`, hint, example에는 기준 답안, 전체 테스트 정의,
  `data-target` 같은 내부 채점 표식을 포함하지 않는다.
- 유사 코드는 기준 답안과 다른 요소명, class, 속성명 또는 값으로 작성하고
  “정답 예시가 아님”을 사용자가 분명히 알 수 있게 한다.
- 선택자 설명은 실제 CSS 의미와 일치해야 한다. `:has()`를 후손 전용으로 설명하거나
  `:first-child`를 같은 태그 중 첫 번째 요소처럼 설명하는 식의 과도한 단순화를 피한다.
- 비슷하지만 개념적으로 틀린 답이 우연히 통과하지 않도록 필요한 경우 비대상 fixture와
  회귀 테스트를 추가한다.
- 교안 문구만 바뀌면 기존 진도와 시도 횟수를 보존한다. 채점 대상, 입력 계약이나 정답 판정
  기준이 달라지면 영향을 받는 문제의 진도를 안전하게 초기화한다.
- 문제 수나 공개 학습 계약을 바꾸면 문제 JSON, loader, DTO, 감사 도구, 테스트와 문서의
  기대값을 함께 갱신한다.

## UI and accessibility

- 학습 지도 카드에는 문제를 풀기 전에도 이해할 수 있는 핵심 키워드, 구체적인 학습 목표와
  정답이 아닌 사용 예시를 제공한다.
- 상세 교안에는 개념의 동작 원리, 예시 해석, 응용 활용과 자주 하는 실수를 포함한다.
- 키보드 포커스 이동, heading 순서, landmark 이름, disclosure의 열림 상태와 모바일
  레이아웃을 회귀 테스트한다.
- 핵심 학습 본문과 코드 예시는 읽을 수 있는 크기와 명도 대비를 유지한다. 보조 레이블을 위해
  본문 가독성을 희생하지 않는다.
- 사용자 흐름이나 스타일을 바꾸면 자동 테스트뿐 아니라 가능할 때 실제 브라우저에서 예습,
  문제 이동, 코드 입력, 채점, 복습 흐름을 확인한다.

## Verification

변경한 범위에 맞는 가장 작은 검증부터 실행하고, 공유 경계나 릴리스 동작을 수정했으면 더 넓은
검증으로 확장한다. 실행하지 못한 검증은 완료 보고에 이유와 함께 명시한다.

### Problem catalog

```bash
node tools/audit-problems.mjs
```

문제 수를 의도적으로 바꾸면 README의 합계, health 계약과 CI의 기대값을 모두 검색하여
일관되게 갱신한다.

### Frontend

의존성이 준비되지 않았을 때 먼저 `npm ci --no-audit --no-fund`를 실행한다.

```bash
cd frontend
npm run typecheck
npm test
npm run build
```

사용자 흐름이나 스타일을 수정했으면 가능할 때 브라우저에서 `http://localhost:3000`을 열고
트랙 선택, 문제 이동, 코드 입력, 채점, 답안 저장과 키보드 동작을 직접 확인한다.

### Backend

```bash
cd backend
mvn --batch-mode --no-transfer-progress verify
```

DB 스키마 변경은 기존 migration을 고치지 말고 새 Flyway migration으로 추가한다.

### Chromium renderer

```bash
cd renderer
npm ci --no-audit --no-fund
npm test
```

Chromium 환경 차이가 중요한 변경은 CI와 같은 Playwright 이미지 또는 Docker 빌드로도 확인한다.

### Java and JavaScript runners

runner의 Dockerfile, 실행 제한, 계약 검사나 프로토콜을 수정하면 해당 이미지를 빌드한다.

```bash
docker build --tag code-quest-java-runner:test java-runner
docker build --tag code-quest-javascript-runner:test javascript-runner
```

### Compose and startup

```bash
docker compose config --quiet
bash tools/test-bootstrap-scripts.sh
```

전체 플랫폼 검증이 필요하면 브라우저 자동 열기를 막고 공식 진입점으로 실행한다.

```bash
CODE_QUEST_NO_OPEN=1 ./start.sh
node tools/audit-reference-answers.mjs
node tools/audit-grading-contracts.mjs cases
node tools/audit-grading-contracts.mjs concurrency
```

renderer나 JavaScript runner의 장애 처리 변경에는 대응하는 `renderer-outage` 또는
`javascript-runner-outage` 감사도 실행한다. 테스트 후 로컬 데이터를 보존하려면
`docker compose down`을 사용한다.

## Review and handoff

- diff에서 보안 경계, 공개 API, migration, 문제 수, 운영체제별 시작 흐름의 의도치 않은 변경을
  우선 확인한다.
- 완료 보고에는 변경한 파일, 사용자에게 보이는 영향, 실행한 검증과 남은 위험을 간결하게 적는다.
- 검증을 실행하지 않았거나 실패한 경우 성공한 것처럼 표현하지 않는다.
- 반복되는 수정 요청이나 리뷰 피드백은 이 파일에 짧은 규칙으로 반영할지 제안한다.
