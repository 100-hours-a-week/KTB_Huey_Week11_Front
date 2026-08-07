# 뮤직피디아 커뮤니티 프런트엔드

**뮤직피디아**는 음악을 듣고 기록하며 자유롭게 이야기를 나누는 React 기반 커뮤니티입니다. Vite로 빌드하며 백엔드(`http://localhost:8080`)와 쿠키 기반 세션으로 통신합니다.

화면 구조는 게시글 피드와 작성 버튼을 중심으로 한 일반적인 커뮤니티 형식을 따릅니다. 위키백과와 Reddit은 serif 로고, 파란 링크, 절제된 색상처럼 시각 요소에만 참고했습니다. 콘텐츠를 상자로 둘러싸거나 세로선으로 나누기보다 여백과 가로 구분선을 사용해 자연스럽게 이어지는 레이아웃을 구성합니다.

## 문서

- [기능 요구사항](docs/functional-requirements.md): 현재 코드에서 확인되는 사용자 흐름, 검증 규칙, 상태 전이 및 리팩터링 인수 조건
- [HTTP 및 브라우저 상태 계약](docs/http-contract.md): 백엔드 endpoint, 요청 형식, 응답 의존성, storage/cookie 계약
- [화면·이벤트 구현 명세](docs/ui-behavior.md): 페이지별 진입 조건, DOM 이벤트, 이동 경로와 React 컴포넌트 경계 후보
- [React 마이그레이션 체크리스트](docs/react-migration-checklist.md): 구현 순서, 보존 테스트와 완료 조건

이 문서들은 **현재 구현을 기준선(characterization baseline)으로 기록**합니다. 리팩터링할 때는 먼저 문서의 인수 조건을 자동화한 뒤 구조를 변경하고, 의도와 구현이 불일치한다고 표시된 항목은 별도 변경으로 다루십시오.

## 화면 구성

| 화면 | 파일 | 역할 |
| --- | --- | --- |
| 로그인/회원가입 | `/login`, `/signup` | 입력 검증, 인증, 프로필 업로드 |
| 게시글 목록 | `/` | 페이지 단위 조회와 무한 스크롤 |
| 게시글 상세 | `/posts/:postId` | 상세 및 댓글 CRUD |
| 게시글 작성/수정 | `/posts/new`, `/posts/edit?postId=` | 본문 및 첨부 업로드, 생성/수정 |
| 회원정보/비밀번호 | `/user`, `/password` | 프로필·비밀번호 변경, 회원 탈퇴 |

## 로컬 실행 전제

1. API 서버를 `localhost:8080`에서 실행합니다. 다른 주소를 사용하면 `VITE_API_ORIGIN`을 설정합니다.
2. `npm install` 후 `npm run dev`를 실행합니다.
3. 브라우저에서 Vite가 출력한 주소의 `/login`을 엽니다.

`npm run build`로 배포용 정적 파일을 만들 수 있습니다. 기존 `*.html` URL은 React route로 redirect되어 저장된 링크도 계속 사용할 수 있습니다.
