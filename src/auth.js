import { api, clearCsrfToken, jsonData } from "./api.js";

export const anonymousAuth = Object.freeze({ status: "anonymous", user: null });
export const unknownAuth = Object.freeze({ status: "unknown", user: null });
let state = unknownAuth;
let initializationRequest = null;
const subscribers = new Set();

export function userFromSession(user) {
  const id = user?.id ?? user?.userId;
  if (id == null) return null;
  return {
    id,
    email: user.email ?? "",
    nickname: user.nickname ?? "",
    profileImageUrl: user.profileImageUrl ?? user.profileImage ?? "",
  };
}

export function getAuthState() { return state; }
export function subscribeAuth(listener) { subscribers.add(listener); return () => subscribers.delete(listener); }
function publish(next) { state = next; subscribers.forEach((listener) => listener(state)); return state; }

export function setAuthenticated(user) {
  const normalized = userFromSession(user);
  if (!normalized) throw new TypeError("authenticated 상태에는 사용자 정보가 필요합니다.");
  return publish({ status: "authenticated", user: normalized });
}

export function clearAuthState() {
  clearCsrfToken();
  return publish(anonymousAuth);
}

export async function initializeAuth() {
  if (state.status !== "unknown") return state;
  if (initializationRequest) return initializationRequest;
  initializationRequest = (async () => {
    const response = await api("/users/me");
    if (response.status === 401) return clearAuthState();
    if (!response.ok) throw new Error(`로그인 상태 확인에 실패했습니다. (${response.status})`);
    return setAuthenticated(await jsonData(response));
  })().finally(() => { initializationRequest = null; });
  return initializationRequest;
}

export async function refreshCurrentUser() {
  const response = await api("/users/me");
  if (response.status === 401) return clearAuthState();
  if (!response.ok) throw new Error(`사용자 정보 조회에 실패했습니다. (${response.status})`);
  return setAuthenticated(await jsonData(response));
}

export function resetAuthForTests() { state = unknownAuth; initializationRequest = null; clearCsrfToken(); }
