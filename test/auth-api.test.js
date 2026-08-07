import test from "node:test";
import assert from "node:assert/strict";
import { api, clearCsrfToken, registerUnauthorizedHandler } from "../src/api.js";
import { clearAuthState, getAuthState, initializeAuth, resetAuthForTests, setAuthenticated } from "../src/auth.js";

const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json" },
});

test.beforeEach(() => {
  resetAuthForTests();
  clearCsrfToken();
  globalThis.document = { cookie: "" };
});

test("auth starts unknown and concurrent initialization shares one /users/me request", async () => {
  let calls = 0;
  globalThis.fetch = async (url) => {
    calls += 1;
    assert.equal(url, "/api/users/me");
    await new Promise((resolve) => setTimeout(resolve, 5));
    return jsonResponse({ data: { id: 7, nickname: "huey" } });
  };

  assert.deepEqual(getAuthState(), { status: "unknown", user: null });
  const [first, second] = await Promise.all([initializeAuth(), initializeAuth()]);
  assert.equal(calls, 1);
  assert.equal(first.status, "authenticated");
  assert.deepEqual(second, first);
  await initializeAuth();
  assert.equal(calls, 1);
});

test("/users/me 401 resolves initialization as anonymous", async () => {
  globalThis.fetch = async () => jsonResponse({ message: "unauthorized" }, 401);
  const state = await initializeAuth();
  assert.deepEqual(state, { status: "anonymous", user: null });
});

test("any protected 401 clears auth while 403 preserves it", async () => {
  const unregister = registerUnauthorizedHandler(clearAuthState);
  setAuthenticated({ id: 1, nickname: "user" });
  globalThis.fetch = async () => jsonResponse({ code: "ACCESS_DENIED" }, 403);
  assert.equal((await api("/admin/users")).status, 403);
  assert.equal(getAuthState().status, "authenticated");

  globalThis.fetch = async () => jsonResponse({}, 401);
  assert.equal((await api("/posts/drafts")).status, 401);
  assert.deepEqual(getAuthState(), { status: "anonymous", user: null });
  unregister();
});

test("mutations share CSRF bootstrap and include credentials and token header", async () => {
  let csrfCalls = 0;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    if (url === "/api/csrf") {
      csrfCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return jsonResponse({ csrfToken: "token-1" });
    }
    requests.push({ url, options });
    return jsonResponse({ data: {} });
  };

  await Promise.all([api("/posts", { method: "POST" }), api("/users/me", { method: "PATCH" })]);
  assert.equal(csrfCalls, 1);
  assert.equal(requests.length, 2);
  for (const { options } of requests) {
    assert.equal(options.credentials, "include");
    assert.equal(options.headers.get("X-XSRF-TOKEN"), "token-1");
  }
});

test("CSRF failures refresh and retry no more than once without clearing auth", async () => {
  setAuthenticated({ id: 2, nickname: "still-here" });
  let csrfCalls = 0;
  let mutationCalls = 0;
  globalThis.fetch = async (url) => {
    if (url === "/api/csrf") return jsonResponse({ csrfToken: `token-${++csrfCalls}` });
    mutationCalls += 1;
    return jsonResponse({ code: "CSRF_TOKEN_INVALID" }, 403);
  };

  const response = await api("/posts", { method: "POST" });
  assert.equal(response.status, 403);
  assert.equal(csrfCalls, 2);
  assert.equal(mutationCalls, 2);
  assert.equal(getAuthState().status, "authenticated");
});
