import { getStore } from "@netlify/blobs";
import { exportBackup, importBackup, readBackup } from "../../backup.js";
import { readSessionCookie } from "./_shared/auth.js";
import { createBlobStateStore, StateConflictError } from "./_shared/blob-state-store.js";

export const config = { path: "/api/state" };

const MAX_BACKUP_BYTES = 2 * 1024 * 1024;
const MAX_REQUEST_BYTES = MAX_BACKUP_BYTES * 4 + 1024;
const STATE_STORE_NAME = "expenses-calculator";

const SECURITY_HEADERS = {
  "cache-control": "no-store",
  "content-security-policy": "default-src 'none'; base-uri 'none'; frame-ancestors 'none'",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
};

class PayloadTooLargeError extends Error {}

const jsonResponse = (status, body, extraHeaders = {}) =>
  Response.json(body, {
    status,
    headers: { ...SECURITY_HEADERS, ...extraHeaders },
  });

const byteLength = (value) => Buffer.byteLength(value, "utf8");

const isValidWriteCondition = (condition) => {
  if (!condition || typeof condition !== "object" || Array.isArray(condition)) return false;
  if (Object.keys(condition).length !== 1) return false;
  if (condition.onlyIfNew === true) return true;
  return (
    typeof condition.etag === "string" &&
    condition.etag.length > 0 &&
    condition.etag.trim() === condition.etag &&
    condition.etag !== "*" &&
    !/[\r\n,]/.test(condition.etag)
  );
};

async function readRequestJson(request) {
  const headerLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(headerLength) && headerLength > MAX_REQUEST_BYTES) {
    throw new PayloadTooLargeError();
  }
  const reader = request.body?.getReader();
  if (!reader) throw new SyntaxError("Request body is missing.");

  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_REQUEST_BYTES) {
        await reader.cancel();
        throw new PayloadTooLargeError();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}

export function createStateAuthenticator(env = process.env) {
  return async (request) => {
    const userId = readSessionCookie(request.headers.get("cookie"), env.SESSION_SECRET);
    if (userId === null || String(userId) !== env.GITHUB_ALLOWED_USER_ID) return null;
    return userId;
  };
}

const defaultAuthenticator = createStateAuthenticator();

export function createDefaultStateStore(getStoreImpl = getStore) {
  let adapter;
  const getAdapter = () => {
    adapter ??= createBlobStateStore(
      getStoreImpl(STATE_STORE_NAME, { consistency: "strong" }),
    );
    return adapter;
  };
  return {
    read() {
      return getAdapter().read();
    },
    write(backup, conditions) {
      return getAdapter().write(backup, conditions);
    },
  };
}

const defaultStore = createDefaultStateStore();

export function createStateHandler({
  authenticate = defaultAuthenticator,
  store = defaultStore,
  expectedOrigin = process.env.PUBLIC_SITE_URL,
} = {}) {
  return async (request) => {
    let userId;
    try {
      userId = await authenticate(request);
    } catch {
      return jsonResponse(503, { error: "authentication_unavailable" });
    }
    if (userId === null || userId === undefined) {
      return jsonResponse(401, { error: "unauthorized" });
    }

    if (request.method !== "GET" && request.method !== "PUT") {
      return new Response(null, {
        status: 405,
        headers: { ...SECURITY_HEADERS, allow: "GET, PUT" },
      });
    }
    if (!expectedOrigin) return jsonResponse(503, { error: "service_not_configured" });

    if (request.method === "GET") {
      let stored;
      try {
        stored = await store.read();
      } catch {
        return jsonResponse(503, { error: "storage_unavailable" });
      }
      if (stored === null) return jsonResponse(404, { error: "state_not_found" });
      if (
        !stored ||
        typeof stored.backup !== "string" ||
        typeof stored.etag !== "string" ||
        !stored.etag
      ) {
        return jsonResponse(500, { error: "stored_state_unavailable" });
      }
      if (byteLength(stored.backup) > MAX_BACKUP_BYTES) {
        return jsonResponse(500, { error: "stored_state_invalid" });
      }
      let backup;
      let notice;
      try {
        const result = readBackup(stored.backup);
        backup = exportBackup(result.state);
        notice = result.notice;
      } catch {
        return jsonResponse(500, { error: "stored_state_invalid" });
      }
      return jsonResponse(200, { backup, notice }, { etag: stored.etag });
    }

    if (request.headers.get("origin") !== expectedOrigin) {
      return jsonResponse(403, { error: "cross_origin_request" });
    }
    if ((request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase() !== "application/json") {
      return jsonResponse(415, { error: "unsupported_content_type" });
    }

    let payload;
    try {
      payload = await readRequestJson(request);
    } catch (error) {
      if (error instanceof PayloadTooLargeError) {
        return jsonResponse(413, { error: "payload_too_large" });
      }
      return jsonResponse(400, { error: "invalid_request_body" });
    }
    if (!payload || typeof payload.backup !== "string") {
      return jsonResponse(400, { error: "invalid_backup" });
    }
    if (byteLength(payload.backup) > MAX_BACKUP_BYTES) {
      return jsonResponse(413, { error: "payload_too_large" });
    }

    let normalizedBackup;
    try {
      normalizedBackup = exportBackup(importBackup(payload.backup));
    } catch {
      return jsonResponse(400, { error: "invalid_backup" });
    }
    if (byteLength(normalizedBackup) > MAX_BACKUP_BYTES) {
      return jsonResponse(413, { error: "payload_too_large" });
    }

    const ifMatch = request.headers.get("if-match");
    const ifNoneMatch = request.headers.get("if-none-match");
    if (ifMatch !== null && ifNoneMatch !== null) {
      return jsonResponse(400, { error: "invalid_write_condition" });
    }
    let conditions;
    if (ifNoneMatch !== null) {
      if (ifNoneMatch !== "*") return jsonResponse(400, { error: "invalid_write_condition" });
      conditions = { onlyIfNew: true };
    } else if (ifMatch !== null) {
      conditions = { etag: ifMatch };
    }
    if (conditions && !isValidWriteCondition(conditions)) {
      return jsonResponse(400, { error: "invalid_write_condition" });
    }
    if (Object.hasOwn(payload, "writeCondition")) {
      const bodyCondition = payload.writeCondition;
      if (
        !isValidWriteCondition(bodyCondition) ||
        (conditions &&
          (conditions.onlyIfNew !== bodyCondition.onlyIfNew ||
            conditions.etag !== bodyCondition.etag))
      ) {
        return jsonResponse(400, { error: "invalid_write_condition" });
      }
      conditions = bodyCondition;
    }
    if (!conditions) {
      return jsonResponse(428, { error: "write_condition_required" });
    }

    let result;
    try {
      result = await store.write(normalizedBackup, conditions);
    } catch (error) {
      if (error instanceof StateConflictError) {
        return jsonResponse(409, { error: "state_conflict" });
      }
      return jsonResponse(503, { error: "storage_unavailable" });
    }
    if (!result || typeof result.etag !== "string" || !result.etag) {
      return jsonResponse(503, { error: "storage_unavailable" });
    }
    return jsonResponse(200, { ok: true }, { etag: result.etag });
  };
}

export default createStateHandler();
