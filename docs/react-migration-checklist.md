# React 마이그레이션 체크리스트

## 구현 결과

- React Router 기반 SPA route와 이전 `*.html` 호환 redirect를 구성했다.
- 공통 API client에서 origin, cookie credentials, CSRF header를 관리한다.
- 인증, 게시글/댓글 CRUD, 이미지 업로드, 프로필/비밀번호/탈퇴 흐름을 React state와 컴포넌트로 이전했다.
- 기존 정적 JavaScript와 개별 HTML entry는 제거했으며, 아래 항목은 후속 E2E 자동화 체크리스트로 유지한다.

## 1. 기준선 동결

- [ ] 각 HTML URL을 직접 열었을 때의 진입/새로고침 동작을 E2E로 캡처한다.
- [ ] API를 mock하여 method, URL, `credentials`, CSRF header, FormData field를 snapshot한다.
- [ ] local/session storage fixture로 상세→수정, header, 회원정보 복원을 검증한다.
- [ ] `functional-requirements.md`의 `FR-*`는 제품 인수 테스트, `OBS-*` 및 `ui-behavior.md`의 관찰 사항은 characterization test로 구분해 이름 붙인다.

## 2. 권장 전환 순서

1. API base URL, cookie reader, multipart client, status 처리기를 구현하되 endpoint 계약을 바꾸지 않는다.
2. route table과 공통 `AppShell`/프로필 메뉴/로그아웃을 구현한다.
3. 로그인과 회원가입을 옮겨 세션 bootstrap 및 저장소 초기화를 고정한다.
4. 목록과 상세의 읽기 흐름을 옮기고 URL query 및 이미지 URL 규칙을 검증한다.
5. 작성/수정/삭제와 첨부 업로드를 옮긴다.
6. 댓글 CRUD와 count/modal 상태를 옮긴다.
7. 프로필/비밀번호/탈퇴를 옮긴다.
8. 모든 route의 새로고침과 401/409/302/빈 응답/네트워크 오류를 회귀 테스트한다.

## 3. 필수 테스트 매트릭스

| 영역 | 정상 경로 | 경계/오류 경로 |
| --- | --- | --- |
| 로그인 | storage 4개 기록, 목록 이동 | 빈 값, 이메일 정규식, 복잡도, 302, CSRF cookie 없음 |
| 가입 | 중복 확인, 이미지 선업로드, 가입 | 409, 잘못된 형식에서도 중복 호출 여부, 업로드 실패 |
| 목록 | page 0 및 다음 page append | 빈 page, 연속 scroll, 요청 역전, 401/500 |
| 게시글 | 작성→상세→수정→삭제 | 0/26/27자, 빈 본문, 첨부 없음/실패, 직접 수정 URL |
| 상세 | 필드/이미지/count 표시 | 999/1000/1500, image null, 401, 두 요청 중 하나 실패 |
| 댓글 | 작성/수정/삭제 및 count | 빈 값/공백, 대상 전환, 삭제 count, XSS 문자열 |
| 회원 | 복원/수정/toast/탈퇴 | 빈 값, 10/11자, 409, 업로드 실패, storage 정리 |
| 비밀번호 | 일치 및 5초 toast | 복잡도, 불일치, CSRF bootstrap/header |
| 공통 | 메뉴 바깥 클릭, 로그아웃 | API 실패, deep link, 새로고침, storage 없는 상태 |

## 4. 완료 정의

- [ ] 모든 `FR-*` 인수 테스트가 React 구현에서 통과한다.
- [ ] 모든 endpoint와 FormData key가 계약 변경 승인 없이 달라지지 않았다.
- [ ] 쿠키 포함 요청과 CSRF 정책을 backend/CORS 환경에서 확인했다.
- [ ] 각 `OBS-*`에 대해 **보존**, **의도적 수정**, **미지원** 중 하나를 결정하고 테스트/변경 기록을 남겼다.
- [ ] 직접 URL 접근, 브라우저 뒤로/앞으로, 새로고침 시 상태 정책이 문서화되어 있다.
- [ ] loading, empty, error, unauthorized 상태가 모든 비동기 화면에 존재한다.
- [ ] 사용자/API 문자열을 JSX text로 렌더링하고 불가피한 HTML 삽입은 sanitize한다.
- [ ] 기존 정적 entry를 제거하기 전에 동일 시나리오의 E2E 결과를 비교했다.
