# 화면·이벤트 구현 명세

> 이 문서는 React 마이그레이션 직전 정적 구현의 characterization baseline이다. 현재 구현은 `src/App.jsx`와 `src/api.js`를 기준으로 하며, 아래 내용은 호환성 비교를 위해 보존한다.

## 1. 문서 범위

이 문서는 React 전환 시 정적 페이지의 이벤트 연결이나 화면 전환을 빠뜨리지 않도록 **현재 코드가 실제로 수행하는 동작**을 기록한다. 기대 동작은 [기능 요구사항](functional-requirements.md), 통신 및 저장 값은 [HTTP 계약](http-contract.md)을 함께 본다. 아래의 “관찰 사항”은 개선 권고가 아니라 호환성 판단이 필요한 현재 동작이다.

## 2. 공통 셸

- `auth.js`가 포함된 페이지는 `DOMContentLoaded` 때 `GET /csrf`를 호출한다. 로그인, 회원가입, 목록, 상세, 작성, 수정, 회원정보 화면에 포함되지만 `password.html`에는 포함되지 않는다.
- 로그인/회원가입 이외의 헤더에는 프로필 버튼과 dropdown이 있다. 프로필 이미지는 `localStorage.user_profileImageUrl`을 그대로 `src`에 지정한다.
- 프로필 버튼은 `.hidden`을 toggle한다. 문서 클릭이 버튼과 메뉴 바깥에서 발생하면 메뉴를 닫는다.
- 로그아웃은 성공 응답일 때만 두 storage 전체를 `clear()`하고 `login.html`로 이동한다.
- 페이지 이동은 클라이언트 라우터가 아니라 상대 URL을 `href` 또는 `window.location`에 대입해 문서 전체를 다시 로드한다.

React에서는 `AppShell`, `ProfileMenu`, `useCsrfBootstrap`과 route guard의 후보가 되지만, 현재 `/csrf` 호출 자체가 인증 성공을 판정하거나 redirect하지는 않는다는 점을 보존 테스트로 먼저 고정한다.

## 3. 페이지별 동작

### 3.1 로그인 (`login.html`, `login.js`)

| 계기 | 현재 동작 |
| --- | --- |
| 이메일 `focusout` | 빈 값/정규식 오류 helper를 갱신하고 전체 활성 조건을 다시 계산한다. 정규식은 `^\D+@\D+\.\D+$`이다. |
| 비밀번호 `focusout` | 빈 값 또는 8~20자 복잡도 오류를 표시한다. 유효한 경우에만 전체 활성 조건을 다시 계산한다. |
| submit | `FormData(email, password)`를 로그인 endpoint에 전송한다. 성공하면 `/csrf` 응답의 사용자 정보를 저장하고 목록으로, 302이면 비밀번호 helper에 로그인 실패 문구를 표시한다. |

관찰 사항: 한 번 유효해진 비밀번호를 다시 무효 값으로 바꾼 경우 `validate()`를 호출하지 않아 활성화된 버튼이 그대로일 수 있다. 유효한 비밀번호 입력 시 이전 오류 문구도 명시적으로 비우지 않는다.

### 3.2 회원가입 (`signup.html`, `signup.js`, `profile.js`)

- 각 입력은 `focusout`에서 상태 객체를 변경하며, 이메일과 닉네임은 형식이 잘못되어도 중복 API를 호출한다.
- 비밀번호와 확인 값은 두 입력의 blur 시 일치 여부를 다시 계산한다.
- 파일 선택은 `profile.js`가 즉시 업로드하여 preview와 숨겨진 `profileImageUrl`을 갱신하고, 별도의 `signup.js` listener가 제출 활성 조건을 갱신한다.
- 모든 상태 문자열이 `valid`일 때만 가입 버튼이 활성화된다. 성공 시 `login.html`로 이동한다.

관찰 사항: 파일 존재 검사는 `profileImage.files !== ""`로 FileList와 문자열을 비교하므로 change 이벤트가 발생하면 실질적으로 항상 참이다. `setExistence` 안의 `renderProfileImageHelperText`도 호출 괄호가 없어 실행되지 않는다. 이메일 상태 계산 한 경로는 존재하지 않는 `validations.equality`를 참조하지만 이후 validity/uniqueness 갱신으로 다시 결정될 수 있다.

### 3.3 목록 (`index.html`, `index.js`)

- `page`는 0에서 시작하고 DOM 준비 시 `/posts?page=0`을 한 번 요청한다.
- viewport 하단이 문서 하단 100px 이내가 될 때마다 `page`를 먼저 증가시키고 요청한다.
- 응답의 `data.posts`를 기존 `#posts` 뒤에 append한다. 카드의 링크는 `view.html?postId=...`이다.
- 제목은 `substr(0, 26)`으로 자르며 댓글/조회수는 원 숫자를 그대로 표시한다. 정의된 소문자 `k` formatter는 사용되지 않는다.

관찰 사항: 로딩 lock, debounce, 중복 제거, 마지막 페이지 판정이 없어 한 번의 하단 체류 중 여러 page 요청이 나갈 수 있고, 실패해도 증가한 page를 복구하지 않는다. 동적 카드 문자열은 API 값을 escaping 없이 `innerHTML`에 삽입한다.

### 3.4 게시글 작성 (`post.html`, `post.js`, `attach.js`)

- title/content는 `focusout` 때만 검증 상태가 바뀐다. 제목 input은 HTML `maxlength=26`이다.
- 첨부 선택 시 즉시 `/public/attachments`에 업로드하고 201일 때 숨겨진 `imageUrl`을 채운다.
- submit은 `FormData(title, content, imageUrl)`를 전송한다. 성공하면 응답 `postId`의 상세로, 401이면 로그인으로 이동한다.

관찰 사항: 초기 상태가 `title=false`, `content=true`이므로 내용을 한 번도 focus하지 않아도 제목 blur만으로 버튼이 활성화된다. submit 직전에는 상태값만 검사하므로 실제 빈 content와 어긋날 수 있다.

### 3.5 상세 및 댓글 (`view.html`, `view.js`)

- 같은 `DOMContentLoaded` 이벤트에 상세와 댓글 목록 요청 listener가 각각 등록되어 두 요청이 독립적으로 시작된다.
- 상세 성공 시 게시글 편집용 값을 local storage에, count를 session storage에 저장한 뒤 렌더링한다. 이미지 상대 경로에는 `http://localhost:8080`을 붙인다.
- `numberToK`는 1000 이상을 단순히 1000으로 나눈 값과 대문자 `K`로 표시한다(예: 1500 → `1.5K`, 1000000 → `1000K`).
- 댓글 입력의 `input` 이벤트가 빈 문자열인지 검사해 등록 버튼을 제어한다. 공백만 있는 댓글은 허용한다.
- 댓글 작성 성공은 목록 append, 저장된 count +1, 화면 count 갱신, 입력 초기화를 수행한다. 입력을 비운 뒤 등록 버튼을 다시 비활성화하지는 않는다.
- 댓글 수정 선택은 원 작성 폼과 대상 카드를 숨기고 수정 폼을 보이며 `sessionStorage.comment_id`를 기록한다. 성공 후 내용과 폼 표시를 복원한다.
- 게시글 삭제 modal만 body scroll을 잠그고 취소/삭제 성공 시 복구한다. 댓글 삭제 modal은 scroll을 잠그지 않는다.

관찰 사항: 댓글의 삭제 버튼은 modal만 열고 대상 ID를 기록하지 않는다. 따라서 직전에 수정한 댓글 ID가 없으면 `commentId=null`, 있으면 그 이전 댓글을 삭제할 수 있다. 댓글 삭제 성공 시 화면 count를 줄이지 않는다. 댓글 문자열도 escaping 없이 `innerHTML`에 삽입한다.

### 3.6 게시글 수정 (`edit.html`, `edit.js`, `attach.js`)

- URL의 `postId`를 읽지만 요청에는 사용하지 않는다. 마지막 상세 조회가 기록한 local storage의 `postId`, 제목, 본문, 이미지 값을 사용한다.
- 상세의 수정 링크는 query 없이 `edit.html`로 이동한다.
- title/content 유효성 검사나 submit disable은 없으며, submit 성공 시 local storage의 ID로 상세에 복귀한다.
- 기존 이미지 URL은 file input인 `#image`의 `src` 속성에 넣으므로 사용자에게 기존 이미지 preview로 보장되지 않는다. 새 첨부는 작성 화면과 같은 즉시 업로드 로직을 사용한다.

### 3.7 회원정보 (`user.html`, `user.js`, `profile.js`)

- 진입 시 email/nickname/profile URL을 local storage에서 폼과 preview에 복원한다.
- 프로필 파일 change는 즉시 업로드하며 반환 URL을 preview와 폼에 넣는다.
- submit 시 nickname 검증 함수를 호출한 뒤 `FormData(nickname, profileImageUrl)`를 PUT한다. 성공하면 storage를 갱신하고 5초 toast를 표시한다.
- 탈퇴 버튼은 modal을 열고, 확인 버튼은 DELETE 성공 시 로그인으로 이동한다. 탈퇴 성공은 storage를 지우지 않는다.

관찰 사항: async `validateNickname()`을 `await`하지 않아 Promise가 truthy로 평가되고 요청이 항상 진행된다. 중복 조회에는 nickname query가 없다. 빈 값/길이 오류는 helper의 `value` 속성에 써서 `<small>`의 화면 text가 바뀌지 않는다. 회원 수정과 탈퇴에는 CSRF header가 없다.

### 3.8 비밀번호 (`password.html`, `password.js`)

- blur 기반 상태와 복잡도 규칙은 회원가입과 동일하다. 두 상태가 valid일 때 submit을 활성화한다.
- `FormData`에는 `name`이 있는 `newPassword`만 포함되며 확인 input은 포함되지 않는다.
- PATCH 성공 시 5초 toast를 표시한다.

관찰 사항: 이 페이지만 `auth.js`를 로드하지 않으며 PATCH에도 CSRF header가 없다.

## 4. React 컴포넌트/상태 경계 후보

| 기존 책임 | 후보 경계 | 보존해야 할 입력/출력 |
| --- | --- | --- |
| 공통 header + logout | `AppShell`, `ProfileMenu` | profile URL, menu open state, logout redirect/storage clear |
| blur 기반 검증 | `useFormValidation` 또는 화면별 schema | blur 시점, helper 문구, disabled 상태 |
| API + CSRF | `apiClient`, `csrfStore` | credentials, header 이름, multipart field, status별 분기 |
| 목록 page/append | `PostFeed` + pagination hook | 최초 page 0, 100px threshold, 응답 순서 |
| 상세/댓글 병렬 조회 | `PostDetail`, `CommentSection` | 독립 요청, count 동기화, modal 대상 |
| 즉시 이미지 업로드 | `ImageUploader` | field 이름, upload 완료 후 URL 전달, preview |
| local/session storage | route loader 또는 persistence adapter | key 이름, 새로고침, 상세→수정 전달 |
| modal/toast | `ConfirmModal`, `Toast` | 취소/확인, scroll lock, 5초 표시 |

컴포넌트 분리는 현재 결함까지 영구화하라는 뜻이 아니다. 먼저 characterization test로 실제 동작을 표시한 뒤, 제품 요구사항으로 유지할 항목과 함께 수정할 `OBS-*`를 구분한다.
