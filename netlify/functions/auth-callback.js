import {
  clearStateCookieHeader,
  createSessionCookie,
  getPublicSiteOrigin,
  isValidOAuthState,
  sessionCookieHeader,
} from "./_shared/auth.js";

export const config = { path: "/api/auth/callback" };

const failure = (status, code, clearState = false) => {
  const headers = new Headers({ "cache-control": "no-store" });
  if (clearState) headers.append("set-cookie", clearStateCookieHeader());
  return Response.json({ error: code }, { status, headers });
};

export function createAuthCallbackHandler({
  env = process.env,
  fetchImpl = fetch,
  now = Date.now,
} = {}) {
  return async (request) => {
    if (request.method !== "GET") {
      return new Response(null, {
        status: 405,
        headers: { allow: "GET", "cache-control": "no-store" },
      });
    }

    const origin = getPublicSiteOrigin(env.PUBLIC_SITE_URL);
    if (
      !origin ||
      !env.GITHUB_OAUTH_CLIENT_ID ||
      !env.GITHUB_OAUTH_CLIENT_SECRET ||
      !/^[1-9]\d*$/.test(env.GITHUB_ALLOWED_USER_ID ?? "") ||
      Buffer.byteLength(env.SESSION_SECRET ?? "") < 32
    ) {
      return failure(500, "auth_not_configured");
    }

    const timestamp = typeof now === "function" ? now() : now;
    const callbackUrl = new URL(request.url);
    const state = callbackUrl.searchParams.get("state");
    const code = callbackUrl.searchParams.get("code");
    if (
      !state ||
      !code ||
      !isValidOAuthState(state, request.headers.get("cookie"), env.SESSION_SECRET, timestamp)
    ) {
      return failure(400, "invalid_oauth_state", true);
    }

    let tokenResponse;
    try {
      tokenResponse = await fetchImpl("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify({
          client_id: env.GITHUB_OAUTH_CLIENT_ID,
          client_secret: env.GITHUB_OAUTH_CLIENT_SECRET,
          code,
          redirect_uri: `${origin}/api/auth/callback`,
        }),
      });
    } catch {
      return failure(502, "github_token_unavailable", true);
    }
    if (!tokenResponse.ok) return failure(502, "github_token_unavailable", true);

    let tokenData;
    try {
      tokenData = await tokenResponse.json();
    } catch {
      return failure(502, "github_token_unavailable", true);
    }
    if (
      !tokenData ||
      typeof tokenData !== "object" ||
      typeof tokenData.access_token !== "string" ||
      !tokenData.access_token
    ) {
      return failure(502, "github_token_unavailable", true);
    }

    let profileResponse;
    try {
      profileResponse = await fetchImpl("https://api.github.com/user", {
        headers: {
          accept: "application/vnd.github+json",
          authorization: `Bearer ${tokenData.access_token}`,
          "x-github-api-version": "2022-11-28",
        },
      });
    } catch {
      return failure(502, "github_profile_unavailable", true);
    }
    if (!profileResponse.ok) return failure(502, "github_profile_unavailable", true);

    let profile;
    try {
      profile = await profileResponse.json();
    } catch {
      return failure(502, "github_profile_unavailable", true);
    }
    if (!profile || typeof profile !== "object" || !Number.isSafeInteger(profile.id)) {
      return failure(502, "github_profile_unavailable", true);
    }
    if (String(profile.id) !== env.GITHUB_ALLOWED_USER_ID) {
      return failure(403, "github_account_not_allowed", true);
    }

    let sessionCookie;
    try {
      sessionCookie = createSessionCookie(profile.id, env.SESSION_SECRET, timestamp);
    } catch {
      return failure(500, "auth_unavailable", true);
    }
    const headers = new Headers({
      location: `${origin}/`,
      "cache-control": "no-store",
    });
    headers.append("set-cookie", clearStateCookieHeader());
    headers.append("set-cookie", sessionCookieHeader(sessionCookie, timestamp));
    return new Response(null, { status: 302, headers });
  };
}

export default createAuthCallbackHandler();
