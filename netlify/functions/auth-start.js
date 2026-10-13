import { randomBytes as secureRandomBytes } from "node:crypto";
import {
  createStateCookie,
  getPublicSiteOrigin,
  stateCookieHeader,
} from "./_shared/auth.js";

export const config = { path: "/api/auth/start" };

const response = (status, code) =>
  Response.json({ error: code }, { status, headers: { "cache-control": "no-store" } });

export function createAuthStartHandler({
  env = process.env,
  randomBytes = secureRandomBytes,
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
      return response(500, "auth_not_configured");
    }

    const timestamp = typeof now === "function" ? now() : now;
    let state;
    try {
      state = randomBytes(32).toString("base64url");
    } catch {
      return response(500, "auth_unavailable");
    }
    const authorizationUrl = new URL("https://github.com/login/oauth/authorize");
    authorizationUrl.searchParams.set("client_id", env.GITHUB_OAUTH_CLIENT_ID);
    authorizationUrl.searchParams.set("redirect_uri", `${origin}/api/auth/callback`);
    authorizationUrl.searchParams.set("scope", "read:user");
    authorizationUrl.searchParams.set("state", state);

    let stateCookie;
    try {
      stateCookie = createStateCookie(state, env.SESSION_SECRET, timestamp);
    } catch {
      return response(500, "auth_unavailable");
    }
    return new Response(null, {
      status: 302,
      headers: {
        location: authorizationUrl.href,
        "set-cookie": stateCookieHeader(stateCookie, timestamp),
        "cache-control": "no-store",
      },
    });
  };
}

export default createAuthStartHandler();
