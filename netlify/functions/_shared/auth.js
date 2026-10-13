import { createHmac, timingSafeEqual } from "node:crypto";

const SESSION_COOKIE = "app_session";
const STATE_COOKIE = "auth_state";
const SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const STATE_LIFETIME_MS = 10 * 60 * 1000;

const signatureFor = (value, secret) =>
  createHmac("sha256", secret).update(value).digest("base64url");

const equalSignature = (left, right) => {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
};

const readCookie = (cookieHeader, name) => {
  const prefix = `${name}=`;
  const item = cookieHeader
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  return item ? item.slice(prefix.length) : null;
};

const isValidSecret = (secret) => typeof secret === "string" && Buffer.byteLength(secret) >= 32;

export function getPublicSiteOrigin(value) {
  try {
    const url = new URL(value);
    const localHttp =
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (
      (!localHttp && url.protocol !== "https:") ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (url.pathname !== "/" && url.pathname !== "")
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

const signedValue = (payload, secret) => `${payload}.${signatureFor(payload, secret)}`;

const verifySignedValue = (value, secret) => {
  if (typeof value !== "string" || !isValidSecret(secret)) return null;
  const separator = value.lastIndexOf(".");
  if (separator < 1) return null;
  const payload = value.slice(0, separator);
  const signature = value.slice(separator + 1);
  if (!equalSignature(signature, signatureFor(payload, secret))) return null;
  return payload;
};

export function createSessionCookie(userId, secret, now = Date.now()) {
  const numericId = Number(userId);
  if (!Number.isSafeInteger(numericId) || numericId <= 0 || !isValidSecret(secret)) {
    throw new TypeError("A valid GitHub user ID and session secret are required.");
  }
  const expiresAt = now + SESSION_LIFETIME_MS;
  return signedValue(`${numericId}.${expiresAt}`, secret);
}

export function readSessionCookie(cookieHeader, secret, now = Date.now()) {
  const payload = verifySignedValue(readCookie(cookieHeader, SESSION_COOKIE), secret);
  if (!payload) return null;
  const [userId, expiresAt, ...extra] = payload.split(".");
  if (extra.length || !/^[1-9]\d*$/.test(userId) || !/^\d+$/.test(expiresAt)) return null;
  const numericId = Number(userId);
  if (!Number.isSafeInteger(numericId) || Number(expiresAt) <= now) return null;
  return numericId;
}

export function createStateCookie(state, secret, now = Date.now()) {
  if (typeof state !== "string" || !state || !isValidSecret(secret)) {
    throw new TypeError("A valid OAuth state and session secret are required.");
  }
  return signedValue(`${state}.${now + STATE_LIFETIME_MS}`, secret);
}

export function isValidOAuthState(state, cookieHeader, secret, now = Date.now()) {
  const payload = verifySignedValue(readCookie(cookieHeader, STATE_COOKIE), secret);
  if (!payload) return false;
  const separator = payload.lastIndexOf(".");
  if (separator < 1 || payload.slice(0, separator) !== state) return false;
  const expiresAt = Number(payload.slice(separator + 1));
  return Number.isSafeInteger(expiresAt) && expiresAt > now;
}

export function stateCookieHeader(value, now = Date.now()) {
  return `${STATE_COOKIE}=${value}; Max-Age=600; Expires=${new Date(now + STATE_LIFETIME_MS).toUTCString()}; HttpOnly; Secure; SameSite=Lax; Path=/`;
}

export function clearStateCookieHeader() {
  return `${STATE_COOKIE}=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax; Path=/`;
}

export function sessionCookieHeader(value, now = Date.now()) {
  return `${SESSION_COOKIE}=${value}; Max-Age=604800; Expires=${new Date(now + SESSION_LIFETIME_MS).toUTCString()}; HttpOnly; Secure; SameSite=Lax; Path=/`;
}

export function clearSessionCookieHeader() {
  return `${SESSION_COOKIE}=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax; Path=/`;
}

export const AUTH_STATE_COOKIE_NAME = STATE_COOKIE;
