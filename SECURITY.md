# Security Policy

## Supported version

보안 수정은 현재 `main` 브랜치와 최신 릴리스에 적용합니다.

## Reporting a vulnerability

다음 문제는 보안 취약점으로 취급합니다.

- 제출한 Java 또는 JavaScript 코드가 sandbox 제한을 우회해 임의 파일, 네트워크, 환경 변수,
  시스템 정보 또는 프로세스에 접근하는 문제
- Java·JavaScript runner의 shared secret 검증을 우회하거나 내부 채점 서비스에
  호스트·외부 네트워크에서 직접 접근할 수 있는 문제
- 공개 문제 API가 의도와 다르게 기준 답안이나 전체 테스트 정의를 반환하는 문제
- 인증되지 않은 데이터베이스 접근이나 다른 학습자의 진도 변조
- 비밀 값, 호스트 파일 또는 운영 로그의 의도하지 않은 노출

공개 Issue에 공격 코드나 민감한 로그를 게시하지 말고 GitHub의 **Private vulnerability reporting**으로
다음 내용을 전달해 주세요.

- 영향을 받는 버전 또는 commit
- 최소 재현 절차
- 예상 결과와 실제 결과
- 접근한 파일·호스트·프로세스 범위
- 가능한 경우 완화 방법

제보를 확인한 뒤 재현 여부와 예상 대응 일정을 비공개 채널에서 공유합니다.

## Public source and learning content

문제 JSON, 기준 답안과 테스트 정의는 공개 저장소에 포함되는 학습 콘텐츠입니다. UI에서 말하는
“숨은 테스트”는 풀이 중 웹 UI와 런타임 문제 API가 직접 노출하지 않는 테스트일 뿐, 저장소
관리자에게도 비공개인 시험 자료나 안티치팅 장치가 아닙니다.

따라서 저장소 소스를 읽어 기준 답안이나 테스트를 확인할 수 있다는 사실 자체는 취약점이 아닙니다.
반대로 배포된 런타임의 공개 문제 API가 계약에 없는 답안·전체 테스트 정의를 반환하거나, 다른
사용자의 제출·진도 데이터가 노출되는 문제는 제보 대상입니다.

## Trust boundaries

현재 Java와 JavaScript runner는 교육용 로컬 실행을 목표로 하는 방어 계층입니다. 백엔드와
runner 사이의 shared secret 인증, 채점기별 내부 네트워크, 컨테이너 제한과 언어별 권한 제한을
함께 적용합니다. 다만 호스트 커널을 공유하는 컨테이너를 인터넷에 공개되는 멀티테넌트 서비스의
최종 격리 경계로 간주하지 않습니다. 공개 서비스에서는 요청별 일회용 sandbox와 별도 커널 또는
microVM 격리가 필요합니다.

이 운영 보안 안내는 [LICENSE](LICENSE)의 이용 조건을 변경하거나 제한하지 않습니다.

Chromium renderer, Java runner와 JavaScript runner는 서로 통신할 수 없고 백엔드만 각각의
internal 네트워크에 참여합니다. 세 채점기는 외부 포트를 게시하지 않습니다. Java runner와
JavaScript runner는 네트워크 격리에 더해 각각 32바이트 이상의 `JAVA_RUNNER_TOKEN`과
`JAVASCRIPT_RUNNER_TOKEN`을 요청마다 일정 시간 비교로 검증합니다. 두 토큰은 서로 다른 값이어야
합니다. 프론트엔드, 백엔드와 세 채점 컨테이너는 비루트 사용자, 읽기 전용 루트 파일시스템,
capability 제거와 자원 제한으로 실행합니다.

원격 채점 호출은 데이터베이스 트랜잭션 밖에서 수행합니다. 채점 결과의 진도 반영만 별도의 짧은
트랜잭션에서 처리하므로 느린 사용자 코드가 데이터베이스 커넥션과 잠금을 장시간 점유하지 않습니다.

256 MiB Java runner는 한 번에 한 제출만 평가하며 서버와 compiler·검사기·실행 JVM에 각각
명시적인 heap·metaspace 제한을 둡니다. 소스 계약용 JDK AST 분석은 장기 실행 서버가 아니라
2초 제한의 별도 프로세스에서 수행합니다. 내부 단계 제한 합계 14초보다 백엔드 요청 제한 20초,
Nginx 읽기 제한 25초를 길게 두어 정상적인 제한 시간 결과가 중간 프록시에서 먼저 끊기지 않게 합니다.

JavaScript runner는 Deno 2.9.4 서버와 테스트 실행 자식을 분리합니다. 부모 서버는 인증,
요청 제한, 자식 수명 관리, 결과 판정과 보고서 조립만 담당합니다. 각 테스트의 제출 코드 실행
경계인 자식은 `--no-prompt`와
`--deny-read`, `--deny-write`, `--deny-net`, `--deny-env`, `--deny-run`, `--deny-sys`,
`--deny-ffi`, `--deny-import`로 실행합니다. 자식은 2.5초와 출력 32KB로 제한하며, runner는
인증 직후 body 읽기부터 한 번에 한 제출만 처리하고 초과 요청에는 `429`를 반환합니다. 위험 API
정적 검사와 Deno 권한 거부는 서로 보완하는 방어 계층입니다. 컨테이너의 비정상 종료는 Compose
`unless-stopped` 정책으로 자동 복구하되 운영자가 `docker compose stop`으로 중지한 상태는
유지합니다.

문제 JSON의 JavaScript 기준 답안과 전체 테스트는 공개 저장소에는 포함되지만 웹 UI나 런타임
문제 API 응답에는 포함되지 않습니다. 백엔드만 테스트를 내부 Deno runner에 전달하며 브라우저는
사용자 JavaScript나 채점 테스트를 직접 실행하지 않습니다.

## Local secrets

`.env.example`은 형식만 제공하며 실제 secret을 포함하지 않습니다. 로컬 실행자는
`openssl rand -hex 32`로 Java와 JavaScript runner에 사용할 서로 다른 token을 생성해 `.env`에
저장해야 합니다. `.env`를 커밋하거나 다른 환경에서 token을 재사용하지 마세요.
`JAVA_RUNNER_TOKEN`과 `JAVASCRIPT_RUNNER_TOKEN`은 백엔드와 각 runner 사이의 서비스 인증
수단이며 사용자 인증, 공개 저장소의 답안 은닉 또는 멀티테넌트 격리를 대체하지 않습니다.
