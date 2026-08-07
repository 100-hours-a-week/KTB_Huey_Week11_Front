export const API_ORIGIN = import.meta.env?.VITE_API_ORIGIN ?? "/api";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const CSRF_ERROR_CODES = new Set(["CSRF_TOKEN_INVALID", "CSRF_TOKEN_MISSING", "INVALID_CSRF_TOKEN"]);
let csrfToken = null;
let csrfRequest = null;
let unauthorizedHandler = () => {};

export class ApiError extends Error {
  constructor(message, response, payload = null) {
    super(message);
    this.name = new.target.name;
    this.status = response?.status ?? 0;
    this.response = response;
    this.payload = payload;
  }
}
export class AuthenticationError extends ApiError {}
export class AuthorizationError extends ApiError {}
export class CsrfError extends AuthorizationError {}
export class ValidationError extends ApiError {}
export class NotFoundError extends ApiError {}
export class ConflictError extends ApiError {}
export class ServerError extends ApiError {}
export class NetworkError extends ApiError {}

export function assetUrl(path) {
  if (!path || /^(https?:|data:|blob:)/.test(path)) return path || "";
  return `${API_ORIGIN}${path}`;
}

export function registerUnauthorizedHandler(handler) {
  unauthorizedHandler = handler;
  return () => { if (unauthorizedHandler === handler) unauthorizedHandler = () => {}; };
}

export function clearCsrfToken() { csrfToken = null; }

function tokenFromCookie() {
  if (typeof document === "undefined") return "";
  const encoded = document.cookie.split("; ").find((cookie) => cookie.startsWith("XSRF-TOKEN="))?.slice(11);
  return encoded ? decodeURIComponent(encoded) : "";
}

async function requestCsrfToken() {
  if (csrfToken) return csrfToken;
  if (csrfRequest) return csrfRequest;
  csrfRequest = (async () => {
    const response = await rawFetch("/csrf", { method: "GET" });
    if (!response.ok) throw await errorFromResponse(response);
    let payload = null;
    try { payload = await response.clone().json(); } catch { /* token may only be provided as a cookie */ }
    csrfToken = payload?.data?.token ?? payload?.csrfToken ?? tokenFromCookie();
    if (!csrfToken) throw new CsrfError("CSRF 토큰을 발급받지 못했습니다.", response, payload);
    return csrfToken;
  })().finally(() => { csrfRequest = null; });
  return csrfRequest;
}

async function rawFetch(path, options) {
  try {
    return await fetch(`${API_ORIGIN}${path}`, { ...options, credentials: "include" });
  } catch (cause) {
    throw new NetworkError("네트워크 요청에 실패했습니다.", null, { cause });
  }
}

async function responsePayload(response) {
  try { return await response.clone().json(); } catch { return null; }
}

function isCsrfFailure(response, payload) {
  return response.status === 403 && CSRF_ERROR_CODES.has(payload?.code ?? payload?.error?.code);
}

export async function errorFromResponse(response) {
  const payload = await responsePayload(response);
  const message = payload?.message ?? payload?.error?.message ?? `API 요청에 실패했습니다. (${response.status})`;
  if (response.status === 401) return new AuthenticationError(message, response, payload);
  if (isCsrfFailure(response, payload)) return new CsrfError(message, response, payload);
  if (response.status === 403) return new AuthorizationError(message, response, payload);
  if (response.status === 400 || response.status === 422) return new ValidationError(message, response, payload);
  if (response.status === 404) return new NotFoundError(message, response, payload);
  if (response.status === 409) return new ConflictError(message, response, payload);
  if (response.status >= 500) return new ServerError(message, response, payload);
  return new ApiError(message, response, payload);
}

export async function api(path, options = {}) {
  const method = (options.method ?? "GET").toUpperCase();
  const mutating = !SAFE_METHODS.has(method);
  const retryCsrf = options.retryCsrf !== false && !(options.body instanceof FormData && options.body.has("image"));
  const request = async (retried = false) => {
    const headers = new Headers(options.headers);
    if (mutating) headers.set("X-XSRF-TOKEN", await requestCsrfToken());
    const { retryCsrf: _ignored, ...fetchOptions } = options;
    const response = await rawFetch(path, { ...fetchOptions, method, headers });
    if (response.status === 401) {
      clearCsrfToken();
      unauthorizedHandler();
    } else if (mutating && retryCsrf && !retried && isCsrfFailure(response, await responsePayload(response))) {
      clearCsrfToken();
      await requestCsrfToken();
      return request(true);
    }
    return response;
  };
  return request();
}

export async function jsonData(response) {
  const payload = await response.json();
  return payload.data;
}

export const bootstrapCsrf = requestCsrfToken;
