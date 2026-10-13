import { test } from "node:test";
import assert from "node:assert/strict";

const authModule = await import("../netlify/functions/_shared/auth.js").catch(() => null);
assert.ok(authModule, "the authentication helpers must exist");
const startModule = await import("../netlify/functions/auth-start.js").catch(() => null);
assert.ok(startModule, "the OAuth start handler must exist");
const callbackModule = await import("../netlify/functions/auth-callback.js").catch(() => null);
assert.ok(callbackModule, "the OAuth callback handler must exist");
const logoutModule = await import("../netlify/functions/auth-logout.js").catch(() => null);
assert.ok(logoutModule, "the logout handler must exist");

const {
  createSessionCookie,
  readSessionCookie,
} = authModule;
const { createAuthStartHandler } = startModule;
const { createAuthCallbackHandler } = callbackModule;
const { createAuthLogoutHandler } = logoutModule;

const secret = "test-session-secret-that-is-at-least-32-bytes";
const now = Date.parse("2026-10-13T00:00:00.000Z");
const env = {
  GITHUB_OAUTH_CLIENT_ID: "test-client",
  GITHUB_OAUTH_CLIENT_SECRET: "test-secret",
  GITHUB_ALLOWED_USER_ID: "45504842",
  SESSION_SECRET: secret,
  PUBLIC_SITE_URL: "https://expenses.example",
};

const startFlow = async (startEnv = env) => {
  const response = await createAuthStartHandler({
    env: startEnv,
    randomBytes: () => Buffer.from("known-state"),
    now: () => now,
  })(new Request("https://untrusted.example/api/auth/start"));
  const locationHeader = response.headers.get("location");
  const location = locationHeader ? new URL(locationHeader) : null;
  const cookie = (response.headers.get("set-cookie") ?? "").split(";")[0];
  return { response, location, cookie };
};

const callbackRequest = ({ state, cookie, origin = env.PUBLIC_SITE_URL } = {}) =>
  new Request(
    `${env.PUBLIC_SITE_URL}/api/auth/callback?code=fake-code&state=${encodeURIComponent(state ?? "a25vd24tc3RhdGU")}`,
    { headers: { cookie: cookie ?? "auth_state=invalid", ...(origin ? { origin } : {}) } },
  );

const providerFetch = (profile = { id: 45504842, login: "A-TongMY" }) =>
  async (url, options) => {
    if (String(url) === "https://github.com/login/oauth/access_token") {
      assert.equal(options.method, "POST");
      return Response.json({ access_token: "fake-provider-token" });
    }
    assert.equal(String(url), "https://api.github.com/user");
    assert.equal(options.headers.authorization, "Bearer fake-provider-token");
    return Response.json(profile);
  };

test("a signed session round-trips the GitHub ID and expires after seven days", () => {
  const cookie = createSessionCookie("45504842", secret, now);

  assert.equal(readSessionCookie(`other=value; app_session=${cookie}`, secret, now), 45504842);
  assert.equal(
    readSessionCookie(`app_session=${cookie}`, secret, now + 7 * 24 * 60 * 60 * 1000),
    null,
  );
});

test("a modified session cookie is rejected", () => {
  const cookie = createSessionCookie("45504842", secret, now);
  const modified = `${cookie[0] === "a" ? "b" : "a"}${cookie.slice(1)}`;

  assert.equal(readSessionCookie(`app_session=${modified}`, secret, now), null);
});

test("OAuth start uses the configured callback and requests only read:user", async () => {
  const { response, location } = await startFlow();

  assert.equal(response.status, 302);
  assert.equal(location.origin, "https://github.com");
  assert.equal(location.pathname, "/login/oauth/authorize");
  assert.equal(location.searchParams.get("client_id"), "test-client");
  assert.equal(location.searchParams.get("scope"), "read:user");
  assert.equal(
    location.searchParams.get("redirect_uri"),
    "https://expenses.example/api/auth/callback",
  );
  assert.match(response.headers.get("set-cookie"), /HttpOnly/i);
  assert.match(response.headers.get("set-cookie"), /Secure/i);
  assert.match(response.headers.get("set-cookie"), /SameSite=Lax/i);
  assert.match(response.headers.get("set-cookie"), /Max-Age=600/i);
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("OAuth start fails safely when required configuration is missing", async () => {
  const { response } = await startFlow({ ...env, SESSION_SECRET: "" });

  assert.equal(response.status, 500);
  assert.doesNotMatch(await response.text(), /secret|test-client/i);
});

test("the callback rejects a mismatched or expired OAuth state", async () => {
  const { cookie } = await startFlow();
  const handler = createAuthCallbackHandler({
    env,
    fetchImpl: providerFetch(),
    now: () => now,
  });

  const mismatch = await handler(callbackRequest({ state: "different-state", cookie }));
  const expired = await createAuthCallbackHandler({
    env,
    fetchImpl: providerFetch(),
    now: () => now + 10 * 60 * 1000 + 1,
  })(callbackRequest({ cookie }));

  assert.equal(mismatch.status, 400);
  assert.equal(expired.status, 400);
});

test("the callback signs a session only for the allowed GitHub ID", async () => {
  const { cookie } = await startFlow();
  const response = await createAuthCallbackHandler({
    env,
    fetchImpl: providerFetch(),
    now: () => now,
  })(callbackRequest({ cookie }));

  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), "https://expenses.example/");
  const sessionCookie = response.headers.get("set-cookie");
  assert.match(sessionCookie, /app_session=/);
  assert.match(sessionCookie, /HttpOnly/i);
  assert.match(sessionCookie, /Secure/i);
  assert.match(sessionCookie, /SameSite=Lax/i);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const value = sessionCookie.match(/app_session=([^;]+)/)[1];
  assert.equal(readSessionCookie(`app_session=${value}`, secret, now), 45504842);
});

test("the callback rejects every non-allowlisted GitHub ID", async () => {
  const { cookie } = await startFlow();
  const response = await createAuthCallbackHandler({
    env,
    fetchImpl: providerFetch({ id: 1, login: "someone-else" }),
    now: () => now,
  })(callbackRequest({ cookie }));

  assert.equal(response.status, 403);
  assert.doesNotMatch(response.headers.get("set-cookie") ?? "", /app_session=/);
});

test("the callback fails closed when OAuth configuration is missing", async () => {
  const { cookie } = await startFlow();
  const response = await createAuthCallbackHandler({
    env: { ...env, GITHUB_OAUTH_CLIENT_SECRET: "" },
    fetchImpl: providerFetch(),
    now: () => now,
  })(callbackRequest({ cookie }));

  assert.equal(response.status, 500);
});

test("the callback rejects non-success token and profile responses", async () => {
  const { cookie } = await startFlow();
  const makeHandler = (fetchImpl) =>
    createAuthCallbackHandler({ env, fetchImpl, now: () => now })(callbackRequest({ cookie }));
  const tokenFailure = await makeHandler(async () => new Response(null, { status: 401 }));
  const profileFailure = await makeHandler(async (url) =>
    String(url) === "https://github.com/login/oauth/access_token"
      ? Response.json({ access_token: "fake-provider-token" })
      : new Response(null, { status: 503 }),
  );

  assert.equal(tokenFailure.status, 502);
  assert.equal(profileFailure.status, 502);
});

test("the callback rejects malformed token and profile payloads safely", async () => {
  const { cookie } = await startFlow();
  const makeHandler = (fetchImpl) =>
    createAuthCallbackHandler({ env, fetchImpl, now: () => now })(callbackRequest({ cookie }));
  const malformedToken = await makeHandler(async () => Response.json(null));
  const malformedProfile = await makeHandler(async (url) =>
    String(url) === "https://github.com/login/oauth/access_token"
      ? Response.json({ access_token: "fake-provider-token" })
      : Response.json(null),
  );

  assert.equal(malformedToken.status, 502);
  assert.equal(malformedProfile.status, 502);
});

test("logout rejects cross-origin requests and clears the session on same-origin POST", async () => {
  const handler = createAuthLogoutHandler({ env });
  const crossOrigin = await handler(
    new Request("https://expenses.example/api/auth/logout", {
      method: "POST",
      headers: { origin: "https://attacker.example" },
    }),
  );
  const logout = await handler(
    new Request("https://expenses.example/api/auth/logout", {
      method: "POST",
      headers: { origin: "https://expenses.example" },
    }),
  );

  assert.equal(crossOrigin.status, 403);
  assert.equal(logout.status, 204);
  assert.match(logout.headers.get("set-cookie"), /app_session=/);
  assert.match(logout.headers.get("set-cookie"), /Max-Age=0/i);
  assert.equal(logout.headers.get("cache-control"), "no-store");
});
