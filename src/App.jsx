import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { api, assetUrl, bootstrapCsrf, clearCsrfToken, jsonData, registerUnauthorizedHandler } from "./api.js";
import { clearAuthState, getAuthState, initializeAuth, refreshCurrentUser, setAuthenticated, subscribeAuth, userFromSession } from "./auth.js";

const passwordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,20}$/;
const emailPattern = /^\w+@\w+\.\w+$/;
const currentUser = { id: null, email: "", nickname: "", profileImageUrl: "" };
const currentPost = { id: null, title: "", content: "", imageUrl: "" };
const AuthContext = createContext(null);

function AuthProvider({ children }) {
  const [auth, setAuth] = useState(getAuthState);
  const setUser = useCallback((nextUser) => {
    const next = nextUser ? userFromSession(nextUser) : null;
    Object.assign(currentUser, next ?? { id: null, email: "", nickname: "", profileImageUrl: "" });
    if (next) setAuthenticated(next); else clearAuthState();
  }, []);
  useEffect(() => {
    const sync = (next) => { Object.assign(currentUser, next.user ?? { id: null, email: "", nickname: "", profileImageUrl: "" }); setAuth(next); };
    const unsubscribe = subscribeAuth(sync);
    const unregisterUnauthorized = registerUnauthorizedHandler(clearAuthState);
    initializeAuth().catch(() => { /* keep unknown: a network failure is not an anonymous session */ });
    return () => { unsubscribe(); unregisterUnauthorized(); };
  }, []);
  return <AuthContext.Provider value={{ ...auth, loading: auth.status === "unknown", setUser, clearAuthState, refreshCurrentUser }}>{children}</AuthContext.Provider>;
}

function useAuth() { return useContext(AuthContext); }

function useDocumentTitle(title) { useEffect(() => { document.title = title; }, [title]); }
function formatCount(value) { const number = Number(value); return number < 1000 ? String(number) : `${number / 1000}K`; }
function isCurrentUserAuthor(item) {
  if (item.userId != null) return currentUser.id != null && String(item.userId) === String(currentUser.id);
  return Boolean(currentUser.nickname) && item.userNickname === currentUser.nickname;
}
async function uploadImage(file, profile = false) {
  const body = new FormData(); body.append(profile ? "profileImage" : "image", file);
  const response = await api(profile ? "/users/me/profile-image" : "/public/attachments", { method: "POST", body });
  if (!response.ok) throw new Error("이미지 업로드에 실패했습니다.");
  return (await jsonData(response)).fileUrl;
}

function Header({ simple = false }) {
  const navigate = useNavigate(); const { user, clearAuthState: clearAuth } = useAuth(); const [open, setOpen] = useState(false); const [logoutError, setLogoutError] = useState(""); const menu = useRef(null);
  useEffect(() => { const close = (event) => { if (!menu.current?.contains(event.target)) setOpen(false); }; document.addEventListener("click", close); return () => document.removeEventListener("click", close); }, []);
  const logout = async () => { setLogoutError(""); try { const response = await api("/users/logout", { method: "POST" }); if (response.ok || response.status === 401) { clearAuth(); sessionStorage.clear(); navigate("/login"); } else setLogoutError("로그아웃에 실패했습니다. 다시 시도해주세요."); } catch { setLogoutError("네트워크 오류로 로그아웃하지 못했습니다."); } };
  return <header className="board-header"><div className="site-brand"><Link to="/"><h1>뮤직피디아</h1></Link></div>{!simple && <div ref={menu}><button id="menu-button" aria-label="사용자 메뉴" aria-expanded={open} onClick={() => setOpen(!open)}><img id="user-profile" className="user-profile-small" src={assetUrl(user?.profileImageUrl) || "/images.png"} alt="내 프로필" /></button>{open && <nav className="dropdown-menu"><Link to="/user">회원정보수정</Link><Link to="/password">비밀번호수정</Link><button onClick={logout}>로그아웃</button>{logoutError && <ErrorText>{logoutError}</ErrorText>}</nav>}</div>}</header>;
}

function Page({ children, simple = false }) {
  const { user, loading } = useAuth();
  if (!simple && loading) return <p className="status">로그인 정보를 확인하는 중…</p>;
  if (!simple && !user) return <Navigate replace to="/login" />;
  return <><Header simple={simple} />{children}</>;
}
function ErrorText({ children }) { return <small className="helper" role="alert">{children}</small>; }
function Toast({ show, children }) { return <div id="toast" className={show ? "" : "hidden"} role="status">{children}</div>; }
function Modal({ open, title, description, onCancel, onConfirm }) { useEffect(() => { if (open) document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = ""; }; }, [open]); if (!open) return null; return <div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div><h2 id="modal-title">{title}</h2><p>{description}</p><div><button onClick={onCancel}>취소</button><button onClick={onConfirm}>확인</button></div></div></div>; }

function SettingsLayout({ active, title, description, children }) {
  return <Page><main className="settings-page"><header className="settings-heading"><p className="eyebrow">ACCOUNT SETTINGS</p><h1>계정 설정</h1><p>프로필과 로그인 정보를 안전하게 관리하세요.</p></header><div className="settings-layout"><nav className="settings-nav" aria-label="계정 설정"><Link className={active === "profile" ? "active" : ""} aria-current={active === "profile" ? "page" : undefined} to="/user"><span>프로필</span><small>공개 정보 관리</small></Link><Link className={active === "password" ? "active" : ""} aria-current={active === "password" ? "page" : undefined} to="/password"><span>비밀번호</span><small>로그인 정보 변경</small></Link></nav><section className="settings-panel" aria-labelledby="settings-panel-title"><header><h2 id="settings-panel-title">{title}</h2><p>{description}</p></header>{children}</section></div></main></Page>;
}

function Login() {
  useDocumentTitle("로그인 | 뮤직피디아"); const navigate = useNavigate(); const { refreshCurrentUser } = useAuth();
  const [form, setForm] = useState({ email: "", password: "" }); const [touched, setTouched] = useState({}); const [loginFailed, setLoginFailed] = useState(false);
  const emailError = !form.email ? "*이메일을 입력해주세요." : !emailPattern.test(form.email) ? "*올바른 이메일 주소 형식을 입력해주세요. (예: example@example.com)" : "";
  const passwordError = !form.password ? "*비밀번호를 입력해주세요." : !passwordPattern.test(form.password) ? "*비밀번호는 8~20자이며 대문자, 소문자, 숫자, 특수문자를 포함해야 합니다." : "";
  const showLoginFailure = () => { setLoginFailed(true); setTimeout(() => setLoginFailed(false), 5000); };
  const submit = async (event) => {
    event.preventDefault();
    try {
      const response = await api("/users/login", { method: "POST", body: new FormData(event.currentTarget) });
      if (!response.ok || response.redirected) return showLoginFailure();
      clearCsrfToken();
      await bootstrapCsrf();
      await refreshCurrentUser(); navigate("/");
    } catch { showLoginFailure(); }
  };
  return <Page simple><article><header><p className="eyebrow">WELCOME BACK</p><h1>로그인</h1><p>좋아하는 음악 이야기를 계속 기록해보세요.</p></header><form className="stack-form" onSubmit={submit}><label>이메일<input type="text" name="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} onBlur={() => setTouched({ ...touched, email: true })} /></label>{touched.email && <ErrorText>{emailError}</ErrorText>}<label>비밀번호<input type="password" name="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} onBlur={() => setTouched({ ...touched, password: true })} /></label>{touched.password && <ErrorText>{passwordError}</ErrorText>}<button className="primary-action" disabled={Boolean(emailError || passwordError)}>로그인</button>{loginFailed && <div className="login-error-toast" role="alert">아이디 또는 비밀번호를 확인해주세요.</div>}</form><p className="auth-switch">아직 회원이 아니신가요? <Link to="/signup">회원가입</Link></p></article></Page>;
}

function ImagePicker({ profile = false, value, onChange, required = false }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const pick = async (event) => { const file = event.target.files?.[0]; if (!file) return; setBusy(true); setError(""); try { onChange(await uploadImage(file, profile)); } catch (e) { setError(e.message); } finally { setBusy(false); } };
  return <div className="image-picker">{profile && <img className="profile-preview" src={assetUrl(value) || "/images.png"} alt="프로필 미리보기" />}<label>{busy ? "업로드 중…" : profile ? "프로필 사진 선택" : "이미지 첨부"}<input type="file" accept="image/*" onChange={pick} required={required && !value} disabled={busy} /></label>{error && <ErrorText>{error}</ErrorText>}</div>;
}

function Signup() {
  useDocumentTitle("회원가입 | 뮤직피디아");

  const navigate = useNavigate();

  const [imageUrl, setImageUrl] = useState("");
  const [form, setForm] = useState({
    email: "",
    password: "",
    confirm: "",
    nickname: "",
  });

  const [touched, setTouched] = useState({});
  const [unique, setUnique] = useState({
    email: null,
    nickname: null,
  });

  const [checking, setChecking] = useState({
    email: false,
    nickname: false,
  });

  const [error, setError] = useState("");

  const check = async (field, value) => {
    if (!value) {
      setUnique((prev) => ({
        ...prev,
        [field]: null,
      }));
      return;
    }

    setChecking((prev) => ({
      ...prev,
      [field]: true,
    }));

    try {
      const response = await api(
        `/users/dup/${field}?${field}=${encodeURIComponent(value)}`
      );

      setUnique((prev) => ({
        ...prev,
        [field]: response.ok,
      }));
    } catch {
      setUnique((prev) => ({
        ...prev,
        [field]: null,
      }));
    } finally {
      setChecking((prev) => ({
        ...prev,
        [field]: false,
      }));
    }
  };

  useEffect(() => {
    if (!form.email || !emailPattern.test(form.email)) {
      setUnique((prev) => ({
        ...prev,
        email: null,
      }));
      return;
    }

    const timer = setTimeout(() => {
      check("email", form.email);
    }, 500);

    return () => clearTimeout(timer);
  }, [form.email]);

  useEffect(() => {
    const validNickname =
      form.nickname &&
      !/\s/.test(form.nickname) &&
      form.nickname.length <= 10;

    if (!validNickname) {
      setUnique((prev) => ({
        ...prev,
        nickname: null,
      }));
      return;
    }

    const timer = setTimeout(() => {
      check("nickname", form.nickname);
    }, 500);

    return () => clearTimeout(timer);
  }, [form.nickname]);

  const errors = {
    email: !form.email
      ? "*이메일을 입력해 주세요."
      : !emailPattern.test(form.email)
        ? "*올바른 이메일 형식이 아닙니다."
        : unique.email === false
          ? "*중복된 이메일입니다."
          : "",

    password: !form.password
      ? "*비밀번호를 입력해 주세요."
      : !passwordPattern.test(form.password)
        ? "*8~20자이며 대·소문자, 숫자, 특수문자를 포함해야 합니다."
        : form.confirm && form.password !== form.confirm
          ? "*비밀번호 확인과 다릅니다."
          : "",

    confirm: !form.confirm
      ? "*비밀번호를 다시 입력해 주세요."
      : form.password !== form.confirm
        ? "*비밀번호와 다릅니다."
        : "",

    nickname: !form.nickname
      ? "*닉네임을 입력해주세요."
      : /\s/.test(form.nickname)
        ? "*띄어쓰기를 없애주세요."
        : form.nickname.length > 10
          ? "*닉네임은 최대 10자입니다."
          : unique.nickname === false
            ? "*중복된 닉네임입니다."
            : "",
  };

  const valid =
    Boolean(imageUrl) &&
    Object.values(errors).every((value) => !value) &&
    unique.email === true &&
    unique.nickname === true &&
    !checking.email &&
    !checking.nickname;

  const submit = async (event) => {
    event.preventDefault();

    if (!valid) {
      return;
    }

    const body = new FormData();
    body.append("email", form.email);
    body.append("password", form.password);
    body.append("nickname", form.nickname);
    body.append("profileImageUrl", imageUrl);

    const response = await api("/users", {
      method: "POST",
      body,
    });

    if (response.ok) {
      navigate("/login");
    } else {
      setError("회원가입에 실패했습니다. 입력 정보를 확인해주세요.");
    }
  };

  return (
    <Page simple>
      <article>
        <header>
          <p className="eyebrow">JOIN THE ARCHIVE</p>
          <h1>회원가입</h1>
        </header>

        <form className="stack-form" onSubmit={submit}>
          <ImagePicker
            profile
            required
            value={imageUrl}
            onChange={setImageUrl}
          />

          {[
            ["email", "이메일", "text"],
            ["password", "비밀번호", "password"],
            ["confirm", "비밀번호 확인", "password"],
            ["nickname", "닉네임", "text"],
          ].map(([name, label, type]) => (
            <div key={name}>
              <label>
                {label}
                <input
                  type={type}
                  value={form[name]}
                  onChange={(event) => {
                    setForm((prev) => ({
                      ...prev,
                      [name]: event.target.value,
                    }));

                    if (name === "email" || name === "nickname") {
                      setUnique((prev) => ({
                        ...prev,
                        [name]: null,
                      }));
                    }
                  }}
                  onBlur={() => {
                    setTouched((prev) => ({
                      ...prev,
                      [name]: true,
                    }));
                  }}
                />
              </label>

              {touched[name] && <ErrorText>{errors[name]}</ErrorText>}

              {checking[name] && (
                <p className="field-message">중복 확인 중...</p>
              )}
            </div>
          ))}

          {error && <ErrorText>{error}</ErrorText>}

          <button
            type="submit"
            className="primary-action"
            disabled={!valid}
          >
            회원가입
          </button>
        </form>

        <p className="auth-switch">
          <Link to="/login">로그인으로 돌아가기</Link>
        </p>
      </article>
    </Page>
  );
}

function Feed() {
  useDocumentTitle("뮤직피디아 | 음악 이야기의 아카이브"); const [posts, setPosts] = useState([]); const [page, setPage] = useState(0); const [hasMore, setHasMore] = useState(true); const [loading, setLoading] = useState(false); const [error, setError] = useState("");
  const load = useCallback(async (target) => { if (loading || !hasMore) return; setLoading(true); setError(""); try { const response = await api(`/posts?page=${target}`); if (!response.ok) throw new Error("게시글을 불러오지 못했습니다."); const next = (await jsonData(response)).posts ?? []; setPosts((old) => [...old, ...next.filter((item) => !old.some((p) => p.postId === item.postId))]); setHasMore(next.length > 0); setPage(target); } catch (e) { setError(e.message); } finally { setLoading(false); } }, [hasMore, loading]);
  useEffect(() => { load(0); }, []); useEffect(() => { const scroll = () => { if (innerHeight + scrollY >= document.documentElement.scrollHeight - 100) load(page + 1); }; addEventListener("scroll", scroll); return () => removeEventListener("scroll", scroll); }, [load, page]);
  return <Page><article className="community-shell"><section className="community-intro"><p className="eyebrow">MUSICPEDIA COMMUNITY</p><h1>오늘은 어떤 음악을 들으셨나요?</h1><p>앨범과 아티스트, 공연에 관한 감상을 기록하고 함께 이야기해보세요.</p></section><div className="feed-toolbar"><div><h2>최근 이야기</h2><p>새롭게 올라온 음악 기록입니다.</p></div><Link className="write-button" to="/posts/new">게시글 작성</Link></div><section id="posts" aria-label="게시글 목록">{posts.map((post) => <div key={post.postId}><div><Link to={`/posts/${post.postId}`}><header><div className="post-title"><h2>{post.title.slice(0,26)}</h2></div><div className="vert between"><div className="vert"><p>댓글 {post.comments}</p><p>조회수 {post.views}</p></div><time>{post.postedTime}</time></div></header><footer className="vert"><img className="user-profile-small" src={assetUrl(post.userProfileImageUrl)} alt=""/><p>{post.userNickname}</p></footer></Link></div></div>)}</section>{loading && <p className="status">불러오는 중…</p>}{error && <p className="status error">{error} <button onClick={() => load(page)}>다시 시도</button></p>}{!loading && !posts.length && !error && <p className="status">첫 번째 음악 이야기를 남겨보세요.</p>}</article></Page>;
}

function PostEditor({ edit = false }) {
  useDocumentTitle(`${edit ? "게시글 수정" : "게시글 작성"} | 뮤직피디아`); const navigate = useNavigate(); const [search] = useSearchParams(); const id = search.get("postId") || currentPost.id; const [form, setForm] = useState({ title: edit ? currentPost.title : "", content: edit ? currentPost.content : "", imageUrl: edit ? currentPost.imageUrl : "" }); const [error, setError] = useState("");
  const submit = async (event) => { event.preventDefault(); if (!form.title.trim() || !form.content.trim()) return setError("제목과 내용을 모두 작성해주세요."); const body = new FormData(); Object.entries(form).forEach(([key,value]) => body.append(key,value)); const response = await api(edit ? `/posts/${id}` : "/posts", { method: edit ? "PATCH" : "POST", body }); if (response.status === 401) return navigate("/login"); if (!response.ok) return setError(`게시글 ${edit ? "수정" : "등록"}에 실패했습니다.`); const postId = edit ? id : (await jsonData(response)).postId; navigate(`/posts/${postId}`); };
  return <Page><article><header><p className="eyebrow">{edit ? "REFINE YOUR STORY" : "NEW MUSIC STORY"}</p><h1>{edit ? "게시글 수정" : "게시글 작성"}</h1></header><form className="stack-form" onSubmit={submit}><label>제목<input type="text" maxLength={26} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}/><span className="counter">{form.title.length}/26</span></label><label>내용<textarea rows="10" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })}/></label><ImagePicker value={form.imageUrl} onChange={(imageUrl) => setForm({ ...form, imageUrl })}/>{form.imageUrl && <img className="post-preview" src={assetUrl(form.imageUrl)} alt="첨부 미리보기"/>}{error && <ErrorText>{error}</ErrorText>}<button className="primary-action" disabled={!form.title.trim() || !form.content.trim()}>{edit ? "수정 완료" : "게시글 등록"}</button></form></article></Page>;
}

function CommentCard({ comment, onEdit, onDelete }) { const canManage = isCurrentUserAuthor(comment); return <div className="comment-card"><header className="vert between"><div className="vert"><img className="user-profile-small" src={assetUrl(comment.userProfileImageUrl)} alt=""/><strong>{comment.userNickname}</strong><time>{comment.postedTime}</time></div>{canManage && <div className="vert"><button onClick={() => onEdit(comment)}>수정</button><button onClick={() => onDelete(comment)}>삭제</button></div>}</header><p>{comment.content}</p></div>; }

function PostDetail() {
  useDocumentTitle("게시글 | 뮤직피디아"); const navigate = useNavigate(); const location = useLocation(); const id = location.pathname.split("/").pop(); const [post, setPost] = useState(null); const [comments, setComments] = useState([]); const [content, setContent] = useState(""); const [editing, setEditing] = useState(null); const [editContent, setEditContent] = useState(""); const [deletePost, setDeletePost] = useState(false); const [deleteComment, setDeleteComment] = useState(null); const [error, setError] = useState("");
  useEffect(() => { let active = true; Promise.all([api(`/posts/view?postId=${id}`), api(`/posts/${id}/comments`)]).then(async ([postResponse, commentsResponse]) => { if (postResponse.status === 401) return navigate("/login"); if (!postResponse.ok) throw new Error("게시글을 불러오지 못했습니다."); const data = await jsonData(postResponse); if (!active) return; setPost(data); Object.assign(currentPost, { id, title: data.title, content: data.content, imageUrl: data.imageUrl ?? "" }); setComments(commentsResponse.ok ? await jsonData(commentsResponse) : []); }).catch((e) => setError(e.message)); return () => { active = false; }; }, [id, navigate]);
  const createComment = async (event) => { event.preventDefault(); if (!content.trim()) return; const body = new FormData(); body.append("content", content); const response = await api(`/posts/${id}/comments`, { method: "POST", body }); if (response.ok) { const comment = await jsonData(response); setComments((items) => [...items, comment]); setPost((item) => ({ ...item, comments: Number(item.comments) + 1 })); setContent(""); } };
  const beginCommentEdit = (comment) => { setEditing(comment); setEditContent(comment.content); };
  const cancelCommentEdit = () => { setEditing(null); setEditContent(""); };
  const updateComment = async (event) => { event.preventDefault(); if (!editContent.trim()) return; const body = new FormData(); body.append("content", editContent); const response = await api(`/posts/${id}/comments?commentId=${editing.commentId}`, { method: "PATCH", body }); if (response.ok) { setComments((items) => items.map((item) => item.commentId === editing.commentId ? { ...item, content: editContent } : item)); cancelCommentEdit(); } };
  const removeComment = async () => { const response = await api(`/posts/${id}/comments?commentId=${deleteComment.commentId}`, { method: "DELETE" }); if (response.ok) { setComments((items) => items.filter((item) => item.commentId !== deleteComment.commentId)); setPost((item) => ({ ...item, comments: Math.max(0, Number(item.comments) - 1) })); setDeleteComment(null); } };
  const removePost = async () => { const response = await api(`/posts/${id}`, { method: "DELETE" }); if (response.ok) navigate("/"); };
  if (error) return <Page><p className="status error">{error}</p></Page>; if (!post) return <Page><p className="status">게시글을 불러오는 중…</p></Page>;
  return <Page><main className="post-detail"><article><header className="post-detail-header"><h1>{post.title}</h1><div className="post-detail-meta"><div className="post-author"><img className="user-profile-small" src={assetUrl(post.userProfileImageUrl)} alt=""/><div><strong>{post.userNickname}</strong><time>{post.postedTime}</time></div></div>{isCurrentUserAuthor(post) && <div className="post-actions"><Link className="button-link" to={`/posts/edit?postId=${id}`}>수정</Link><button onClick={() => setDeletePost(true)}>삭제</button></div>}</div></header><div className="post-detail-body">{post.imageUrl && <img className="post-image" src={assetUrl(post.imageUrl)} alt="게시글 첨부"/>}<p className="post-content">{post.content}</p></div><div id="stats" aria-label="게시글 통계"><div className="stat"><strong>{formatCount(post.views)}</strong><span>조회수</span></div><div className="stat"><strong>{formatCount(post.comments)}</strong><span>댓글</span></div></div><section className="comments"><h2>댓글</h2>{editing ? <form className="comment-form" onSubmit={updateComment}><input type="text" aria-label="수정할 댓글 내용" name="content" value={editContent} onChange={(event) => setEditContent(event.target.value)} autoFocus/><button className="primary-action" disabled={!editContent.trim()}>댓글 수정</button><button type="button" onClick={cancelCommentEdit}>취소</button></form> : <form className="comment-form" onSubmit={createComment}><input type="text" aria-label="댓글 내용" value={content} onChange={(e) => setContent(e.target.value)} placeholder="댓글을 남겨주세요!"/><button className="primary-action" disabled={!content.trim()}>댓글 등록</button></form>}<div className="comment-list">{comments.filter((comment) => comment.commentId !== editing?.commentId).map((comment) => <CommentCard key={comment.commentId} comment={comment} onEdit={beginCommentEdit} onDelete={setDeleteComment}/>)}</div></section></article></main><Modal open={deletePost} title="게시글을 삭제하시겠습니까?" description="삭제한 내용은 복구할 수 없습니다." onCancel={() => setDeletePost(false)} onConfirm={removePost}/><Modal open={Boolean(deleteComment)} title="댓글을 삭제하시겠습니까?" description="삭제한 내용은 복구할 수 없습니다." onCancel={() => setDeleteComment(null)} onConfirm={removeComment}/></Page>;
}

function UserSettings() {
  useDocumentTitle("회원정보 수정 | 뮤직피디아"); const navigate = useNavigate(); const { user, setUser, clearAuthState: clearAuth } = useAuth(); const [nickname, setNickname] = useState(user?.nickname ?? ""); const [imageUrl, setImageUrl] = useState(user?.profileImageUrl ?? ""); const [error, setError] = useState(""); const [toast, setToast] = useState(false); const [modal, setModal] = useState(false);
  useEffect(() => { if (user) { setNickname(user.nickname); setImageUrl(user.profileImageUrl); } }, [user]);
  const save = async (event) => { event.preventDefault(); if (!nickname.trim() || nickname.length > 10 || /\s/.test(nickname)) return setError("닉네임은 공백 없이 1~10자로 입력해주세요."); const duplicate = await api(`/users/dup/nickname?nickname=${encodeURIComponent(nickname)}`); if (duplicate.status === 409 && nickname !== user?.nickname) return setError("중복된 닉네임입니다."); const body = new FormData(); body.append("nickname", nickname); body.append("profileImageUrl", imageUrl); const response = await api("/users/me", { method: "PUT", body }); if (!response.ok) return setError("회원정보 변경에 실패했습니다."); setUser({ ...user, nickname, profileImageUrl: imageUrl }); setError(""); setToast(true); setTimeout(() => setToast(false), 5000); };
  const withdraw = async () => { setError(""); try { const response = await api("/users/me", { method: "DELETE" }); if (response.ok) { clearAuth(); sessionStorage.clear(); navigate("/"); } else { setModal(false); setError("회원 탈퇴에 실패했습니다. 로그인 상태는 유지됩니다."); } } catch { setModal(false); setError("네트워크 오류로 회원 탈퇴에 실패했습니다."); } };
  return <SettingsLayout active="profile" title="프로필" description="커뮤니티에 표시되는 사진과 닉네임을 변경합니다."><form className="stack-form settings-form" onSubmit={save}><div className="profile-setting"><ImagePicker profile value={imageUrl} onChange={setImageUrl}/><div><strong>프로필 사진</strong><p>정사각형 이미지를 사용하면 가장 자연스럽게 보여요.</p></div></div><label>이메일<span className="readonly-field">{user?.email || "로그인 정보 없음"}</span></label><label>닉네임<input type="text" value={nickname} maxLength={10} onChange={(e) => setNickname(e.target.value)}/><small className="field-caption">공백 없이 최대 10자까지 입력할 수 있습니다.</small></label>{error && <ErrorText>{error}</ErrorText>}<div className="settings-actions"><button className="primary-action">변경사항 저장</button></div></form><div className="danger-zone"><div><strong>회원 탈퇴</strong><p>계정과 작성한 활동을 더 이상 이용할 수 없습니다.</p></div><button className="danger-link" onClick={() => setModal(true)}>회원 탈퇴</button></div><Toast show={toast}>회원정보가 수정되었습니다.</Toast><Modal open={modal} title="회원 탈퇴하시겠습니까?" description="작성한 게시글과 댓글은 복구할 수 없습니다." onCancel={() => setModal(false)} onConfirm={withdraw}/></SettingsLayout>;
}

function PasswordSettings() {
  useDocumentTitle("비밀번호 수정 | 뮤직피디아"); const [password, setPassword] = useState(""); const [confirm, setConfirm] = useState(""); const [error, setError] = useState(""); const [toast, setToast] = useState(false); const valid = passwordPattern.test(password) && password === confirm;
  const submit = async (event) => { event.preventDefault(); if (!valid) return; const body = new FormData(); body.append("newPassword", password); const response = await api("/users/me/password", { method: "PATCH", body }); if (!response.ok) return setError("비밀번호 변경에 실패했습니다."); setError(""); setToast(true); setPassword(""); setConfirm(""); setTimeout(() => setToast(false), 5000); };
  return <SettingsLayout active="password" title="비밀번호" description="다른 서비스에서 사용하지 않는 안전한 비밀번호로 변경하세요."><form className="stack-form settings-form" onSubmit={submit}><div className="password-guide"><strong>안전한 비밀번호</strong><p>8~20자이며 대문자, 소문자, 숫자, 특수문자를 각각 하나 이상 포함해야 합니다.</p></div><label>새 비밀번호<input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)}/></label>{password && !passwordPattern.test(password) && <ErrorText>*비밀번호 형식을 확인해주세요.</ErrorText>}<label>비밀번호 확인<input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)}/></label>{confirm && password !== confirm && <ErrorText>*비밀번호와 다릅니다.</ErrorText>}{error && <ErrorText>{error}</ErrorText>}<div className="settings-actions"><button className="primary-action" disabled={!valid}>비밀번호 변경</button></div></form><Toast show={toast}>비밀번호가 변경되었습니다.</Toast></SettingsLayout>;
}

function LegacyRedirect({ to }) { const location = useLocation(); return <Navigate replace to={`${to}${location.search}`}/>; }
export default function App() { return <AuthProvider><Routes><Route path="/" element={<Feed/>}/><Route path="/login" element={<Login/>}/><Route path="/signup" element={<Signup/>}/><Route path="/posts/new" element={<PostEditor/>}/><Route path="/posts/edit" element={<PostEditor edit/>}/><Route path="/posts/:postId" element={<PostDetail/>}/><Route path="/user" element={<UserSettings/>}/><Route path="/password" element={<PasswordSettings/>}/><Route path="/index.html" element={<LegacyRedirect to="/"/>}/><Route path="/login.html" element={<LegacyRedirect to="/login"/>}/><Route path="/signup.html" element={<LegacyRedirect to="/signup"/>}/><Route path="/post.html" element={<LegacyRedirect to="/posts/new"/>}/><Route path="/edit.html" element={<LegacyRedirect to="/posts/edit"/>}/><Route path="/view.html" element={<LegacyViewRedirect/>}/><Route path="/user.html" element={<LegacyRedirect to="/user"/>}/><Route path="/password.html" element={<LegacyRedirect to="/password"/>}/><Route path="*" element={<Navigate replace to="/"/>}/></Routes></AuthProvider>; }
function LegacyViewRedirect() { const [search] = useSearchParams(); return <Navigate replace to={`/posts/${search.get("postId") ?? ""}`}/>; }
