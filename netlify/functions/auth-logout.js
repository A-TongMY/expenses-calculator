import { clearSessionCookieHeader, getPublicSiteOrigin } from "./_shared/auth.js";

export const config = { path: "/api/auth/logout" };

export function createAuthLogoutHandler({ env = process.env } = {}) {
  return async (request) => {
    if (request.method !== "POST") {
      return new Response(null, {
        status: 405,
        headers: { allow: "POST", "cache-control": "no-store" },
      });
    }
    const siteOrigin = getPublicSiteOrigin(env.PUBLIC_SITE_URL);
    if (!siteOrigin) {
      return Response.json(
        { error: "auth_not_configured" },
        { status: 500, headers: { "cache-control": "no-store" } },
      );
    }
    const requestOrigin = getPublicSiteOrigin(request.headers.get("origin"));
    if (!requestOrigin || requestOrigin !== siteOrigin) {
      return Response.json(
        { error: "cross_origin_request" },
        { status: 403, headers: { "cache-control": "no-store" } },
      );
    }
    return new Response(null, {
      status: 204,
      headers: {
        "set-cookie": clearSessionCookieHeader(),
        "cache-control": "no-store",
      },
    });
  };
}

export default createAuthLogoutHandler();
