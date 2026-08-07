# HTTP 및 브라우저 상태 계약

## 1. 공통 통신 규칙

- 기본 API origin: `http://localhost:8080`. 배포 환경에서는 `VITE_API_ORIGIN`으로 변경한다.
- 모든 실제 fetch는 `credentials: "include"`로 세션 쿠키를 전송한다.
- `auth.js`가 페이지 로드 시 `GET /csrf`를 호출한다.
- `cookie.js`는 `XSRF-TOKEN` 쿠키 값을 읽는다. 상태 변경 요청 대부분은 이를 `X-XSRF-TOKEN` 요청 header로 복사한다.
- 폼 요청은 JSON이 아니라 브라우저 `FormData`이며 브라우저가 multipart content type과 boundary를 정한다.
- 응답은 대체로 `{ "data": ... }` envelope을 전제로 한다.

## 2. Endpoint 목록

| 기능 | Method / path | 요청 | 클라이언트가 사용하는 성공 응답 |
| --- | --- | --- | --- |
| CSRF 초기화 | `GET /csrf` | cookie 포함 | 로그인 직후 `data.userId`, `email`, `nickname`, `profileImage` |
| 로그인 | `POST /users/login` | FormData: `email`, `password`; CSRF | 성공 여부 |
| 로그아웃 | `POST /users/logout` | CSRF | 성공 여부 |
| 회원가입 | `POST /users` | FormData: `email`, `password`, `nickname`, `profileImageUrl`; CSRF | 성공 여부 |
| 이메일 중복 | `GET /users/dup/email?email={email}` | query | 2xx=사용 가능, 409=중복 |
| 닉네임 중복(가입) | `GET /users/dup/nickname?nickname={nickname}` | query | 2xx=사용 가능, 409=중복 |
| 닉네임 중복(수정) | `GET /users/dup/nickname` | 현재 코드는 query 없음 | 2xx=사용 가능, 409=중복 |
| 프로필 이미지 업로드 | `POST /users/me/profile-image` | FormData: `profileImage`; CSRF | `data.fileUrl` |
| 회원정보 수정 | `PUT /users/me` | FormData: `nickname`, `profileImageUrl` | 성공 여부 |
| 회원 탈퇴 | `DELETE /users/me` | cookie | 성공 여부 |
| 비밀번호 변경 | `PATCH /users/me/password` | FormData: `newPassword` | 성공 여부 |
| 첨부 업로드 | `POST /public/attachments` | FormData: `image`; CSRF | HTTP 201, `data.fileUrl` |
| 게시글 목록 | `GET /posts?page={page}` | page query; CSRF header도 전송 | `data.posts[]` |
| 게시글 상세 | `GET /posts/view?postId={id}` | postId query | `data` 게시글 |
| 게시글 작성 | `POST /posts` | FormData: `title`, `content`, `imageUrl`; CSRF | `data.postId` |
| 게시글 수정 | `PATCH /posts/{postId}` | 동일 FormData; CSRF | 성공 여부 |
| 게시글 삭제 | `DELETE /posts/{postId}` | CSRF | 성공 여부 |
| 댓글 목록 | `GET /posts/{postId}/comments` | cookie | `data[]` 댓글 |
| 댓글 작성 | `POST /posts/{postId}/comments` | FormData: `content`; CSRF | `data` 생성 댓글 |
| 댓글 수정 | `PATCH /posts/{postId}/comments?commentId={id}` | FormData: `content`; CSRF | 성공 여부 |
| 댓글 삭제 | `DELETE /posts/{postId}/comments?commentId={id}` | CSRF | 성공 여부 |

주석 처리된 `PATCH /posts/{postId}/reports`는 현재 계약에서 제외한다.

## 3. 응답 객체 필드

### 게시글 목록 원소

`postId`, `title`, `comments`, `views`, `postedTime`, `userProfileImageUrl`, `userNickname`을 사용한다.

### 게시글 상세

`title`, `content`, `imageUrl`, `comments`, `views`, `postedTime`, `userProfileImageUrl`, `userNickname`을 사용한다.

### 댓글

`commentId`, `content`, `postedTime`, `userProfileImageUrl`, `userNickname`을 사용한다.

이미지 필드는 일반적으로 API가 상대 경로를 반환하고 클라이언트가 API origin을 앞에 붙인다고 가정한다. 단, 수정 화면으로 전달되는 게시글 이미지 URL과 업로드 후 저장되는 URL은 코드 경로별 처리 방식이 다르므로 리팩터링 전에 실제 API 응답을 characterization test로 고정해야 한다.

## 4. 브라우저 저장소 계약

### localStorage

| key | 기록 시점 | 소비 위치 / 의미 |
| --- | --- | --- |
| `user_id` | 로그인 성공 후 | 로그인 사용자 ID |
| `user_email` | 로그인 성공 후 | 회원정보 화면 이메일 |
| `user_nickname` | 로그인/회원정보 수정 후 | 회원정보 화면 닉네임 |
| `user_profileImageUrl` | 로그인/회원정보 수정 후 | header와 회원정보 화면 이미지 |
| `postId` | 상세 조회 성공 후 | 게시글 수정 대상과 복귀 URL |
| `postTitle` | 상세 조회 성공 후 | 수정 폼 초기 제목 |
| `postContent` | 상세 조회 성공 후 | 수정 폼 초기 본문 |
| `postImageUrl` | 상세 조회 성공 후 | 수정 화면 기존 이미지 |

### sessionStorage

| key | 기록 시점 | 의미 |
| --- | --- | --- |
| `views` | 상세 조회 성공 후 | 상세 화면에 표시할 조회수 |
| `comments` | 상세 조회/댓글 작성 후 | 상세 화면에 표시할 댓글 수 |
| `comment_id` | 댓글 수정 선택 시 | 수정 및 삭제 요청 대상 댓글 ID |

로그아웃 성공 시 localStorage와 sessionStorage 전체를 삭제한다. 따라서 같은 origin에서 다른 기능이 storage를 공유하게 된다면 이 동작도 고려해야 한다.

## 5. 리팩터링 시 호환성 체크리스트

- API base URL을 통합할 경우 쿠키의 domain/SameSite/CORS 동작을 함께 검증한다.
- JSON 전환 전 백엔드가 현재 multipart field 이름을 계약으로 사용하는지 확인한다.
- CSRF 유틸리티를 교체할 때 쿠키 이름과 header 이름을 보존한다.
- storage를 상태 관리 계층으로 교체할 때 새로고침 및 상세→수정 직접 이동의 동작을 명시한다.
- 성공 status 범위(`response.ok`)와 특수 status(첨부 201, 로그인 실패 302, 중복 409, 인증 실패 401)를 테스트한다.
