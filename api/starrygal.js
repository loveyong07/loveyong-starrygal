/** Deploy this server-only function to loveyong07.top. Never use a VITE_* token. */
import { createHash } from "node:crypto";

const UPSTREAM = "https://developer.touchgal.com/api/v1/";
const cache = new Map();
const pending = new Map();
const visitors = new Map();
const MAX_CACHE_ENTRIES = 500;
const MAX_VISITORS = 2000;
const allowedParameters = new Set([
  "action",
  "keyword",
  "uniqueId",
  "allowNsfw",
  "page",
]);
const string = (value) => (typeof value === "string" ? value : "");
const strings = (value) =>
  Array.isArray(value)
    ? value.filter((item) => typeof item === "string").slice(0, 100)
    : [];
const safeUrl = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
};
const touchgalUrl = (value) => {
  const valueUrl = safeUrl(value);
  return valueUrl &&
    /(^|\.)touchgal\.(ink|com)$/.test(new URL(valueUrl).hostname)
    ? valueUrl
    : null;
};
const positiveInteger = (value) =>
  Number.isSafeInteger(value) && value >= 0 ? value : 0;

function send(res, status, body, ttl = 0, retryAfter) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("X-Content-Type-Options", "nosniff");
  // Public metadata, no cookies. This also supports the GitHub Pages preview.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader(
    "Cache-Control",
    ttl
      ? `public, max-age=60, s-maxage=${ttl}, stale-while-revalidate=3600`
      : "no-store",
  );
  if (retryAfter) res.setHeader("Retry-After", String(retryAfter));
  res.status(status).json(body);
}
function failure(res, status, code, retryAfter) {
  send(
    res,
    status,
    { success: false, error: { code, message: code } },
    0,
    retryAfter,
  );
}

export function parseRequest(requestUrl) {
  if (requestUrl.length > 2048) throw new Error("BAD_REQUEST");
  const url = new URL(requestUrl, "https://relay.invalid");
  for (const name of url.searchParams.keys()) {
    if (
      !allowedParameters.has(name) ||
      url.searchParams.getAll(name).length !== 1
    )
      throw new Error("BAD_REQUEST");
  }
  const action = url.searchParams.get("action") || "status";
  if (!["status", "search", "detail", "resources", "patches"].includes(action))
    throw new Error("BAD_REQUEST");
  const allowNsfw = url.searchParams.get("allowNsfw") || "false";
  if (allowNsfw !== "true" && allowNsfw !== "false")
    throw new Error("BAD_REQUEST");
  const upstream = new URL(
    action === "status" ? "me" : "games/search",
    UPSTREAM,
  );
  if (action === "search") {
    const keyword = (url.searchParams.get("keyword") || "").trim();
    const pageText = url.searchParams.get("page") || "1";
    const page = Number(pageText);
    if (
      [...keyword].length < 3 ||
      [...keyword].length > 100 ||
      !/^\d+$/.test(pageText) ||
      !Number.isInteger(page) ||
      page < 1 ||
      page > 100
    )
      throw new Error("BAD_REQUEST");
    upstream.searchParams.set("keyword", keyword);
    upstream.searchParams.set("page", String(page));
    upstream.searchParams.set("limit", "20");
  } else if (action !== "status") {
    const id = url.searchParams.get("uniqueId") || "";
    if (!/^[a-z\d]{8}$/i.test(id)) throw new Error("BAD_REQUEST");
    upstream.pathname = `/api/v1/games/${id}${action === "detail" ? "" : "/" + action}`;
  }
  if (action !== "status") upstream.searchParams.set("allowNsfw", allowNsfw);
  return {
    action,
    upstream,
    ttl: action === "status" ? 300 : action === "detail" ? 86400 : 3600,
  };
}

/** Whitelist the documented fields, including on the credential self-check. */
export function publicData(action, data = {}) {
  if (action === "status")
    return {
      service: "StarryGal TouchGal relay",
      ready: true,
      minuteLimit: positiveInteger(data.minuteLimit),
      dailyLimit: positiveInteger(data.dailyLimit),
    };
  if (action === "search")
    return {
      items: Array.isArray(data.items)
        ? data.items
            .filter((item) => item && /^[a-z\d]{8}$/i.test(item.uniqueId))
            .map((item) => ({
              name: string(item.name),
              uniqueId: item.uniqueId,
            }))
            .slice(0, 20)
        : [],
      pagination: {
        page: positiveInteger(data.pagination?.page),
        total: positiveInteger(data.pagination?.total),
        hasMore: data.pagination?.hasMore === true,
      },
    };
  if (action === "detail")
    return {
      uniqueId: string(data.uniqueId),
      name: string(data.name),
      aliases: strings(data.aliases),
      introduction: string(data.introduction),
      bannerUrl: safeUrl(data.bannerUrl),
      type: strings(data.type),
      platform: strings(data.platform),
      language: strings(data.language),
      tags: strings(data.tags),
      releaseDate: string(data.releaseDate),
      updatedAt: string(data.updatedAt),
      companies: Array.isArray(data.companies)
        ? data.companies
            .filter(Boolean)
            .map((company) => ({
              name: string(company.name),
              aliases: strings(company.aliases),
            }))
            .slice(0, 50)
        : [],
      rating: {
        average:
          typeof data.rating?.average === "number" &&
          Number.isFinite(data.rating.average)
            ? data.rating.average
            : null,
        count: positiveInteger(data.rating?.count),
      },
      touchgalUrl: touchgalUrl(data.touchgalUrl),
    };
  return {
    items: Array.isArray(data.items)
      ? data.items
          .filter((item) => item && touchgalUrl(item.deepLink))
          .slice(0, 200)
          .map((item) => ({
            name: string(item.name),
            description: string(item.description),
            sizes: strings(item.sizes),
            categories: strings(item.categories),
            deepLink: touchgalUrl(item.deepLink),
          }))
      : [],
  };
}

// Best-effort protection per warm instance; upstream still enforces its global token quotas.
function visitorAllowed(req) {
  const forwarded = req.headers?.["x-forwarded-for"];
  const address = (
    Array.isArray(forwarded)
      ? forwarded[0]
      : forwarded || req.socket?.remoteAddress || "unknown"
  ).split(",")[0];
  const key = createHash("sha256").update(address).digest("hex").slice(0, 24);
  const now = Date.now();
  for (const [id, value] of visitors)
    if (value.until <= now) visitors.delete(id);
  let item = visitors.get(key);
  if (!item) {
    if (visitors.size >= MAX_VISITORS) return false;
    item = { until: now + 60000, count: 0 };
    visitors.set(key, item);
  }
  return ++item.count <= 30;
}

export function createHandler({
  fetchImpl = fetch,
  token = () => process.env.TOUCHGAL_API_TOKEN,
} = {}) {
  return async function handler(req, res) {
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
      res.status(204).end();
      return;
    }
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET, OPTIONS");
      failure(res, 405, "METHOD_NOT_ALLOWED");
      return;
    }
    let parsed;
    try {
      parsed = parseRequest(req.url || "");
    } catch {
      failure(res, 400, "BAD_REQUEST");
      return;
    }
    const secret = token()?.trim();
    if (!secret) {
      failure(res, 503, "NOT_CONFIGURED");
      return;
    }
    if (!visitorAllowed(req)) {
      failure(res, 429, "RATE_LIMITED", 60);
      return;
    }
    // The token hash isolates a rotated credential without retaining its plaintext as a cache key.
    const key =
      createHash("sha256").update(secret).digest("hex").slice(0, 12) +
      parsed.upstream.href;
    const cached = cache.get(key);
    if (cached && cached.expires > Date.now()) {
      send(res, 200, cached.body, parsed.ttl);
      return;
    }
    if (cached) cache.delete(key);
    try {
      let operation = pending.get(key);
      if (!operation) {
        operation = (async () => {
          const response = await fetchImpl(parsed.upstream, {
            headers: {
              Authorization: `Bearer ${secret}`,
              Accept: "application/json",
              "User-Agent":
                "StarryGal/0.2 (+https://github.com/loveyong07/loveyong-starrygal)",
            },
            signal: AbortSignal.timeout(12000),
            redirect: "error",
          });
          if (!response.ok) {
            const status = [400, 404, 429].includes(response.status)
              ? response.status
              : 503;
            const code =
              {
                400: "BAD_REQUEST",
                401: "UNAUTHORIZED",
                404: "NOT_FOUND",
                429: "RATE_LIMITED",
              }[response.status] || "UPSTREAM_UNAVAILABLE";
            return { status, code };
          }
          // Limit the response before JSON parsing; upstream content is not trusted.
          const reader = response.body.getReader();
          const chunks = [];
          let size = 0;
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              size += value.byteLength;
              if (size > 2 * 1024 * 1024) {
                await reader.cancel();
                throw new Error("UPSTREAM_UNAVAILABLE");
              }
              chunks.push(Buffer.from(value));
            }
          } finally {
            reader.releaseLock();
          }
          const envelope = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          if (
            envelope?.success !== true ||
            !envelope.data ||
            typeof envelope.data !== "object" ||
            Array.isArray(envelope.data)
          )
            throw new Error("UPSTREAM_UNAVAILABLE");
          return {
            status: 200,
            body: {
              success: true,
              data: publicData(parsed.action, envelope.data),
            },
          };
        })();
        pending.set(key, operation);
        // Cleanup belongs to the operation owner, including rejected requests.
        void operation.finally(() => pending.delete(key)).catch(() => {});
      }
      const result = await operation;
      if (result.status !== 200) {
        failure(
          res,
          result.status,
          result.code,
          result.status === 429 ? 60 : undefined,
        );
        return;
      }
      if (cache.size >= MAX_CACHE_ENTRIES)
        cache.delete(cache.keys().next().value);
      cache.set(key, {
        body: result.body,
        expires: Date.now() + parsed.ttl * 1000,
      });
      send(res, 200, result.body, parsed.ttl);
    } catch {
      failure(res, 503, "UPSTREAM_UNAVAILABLE");
    }
  };
}

export default createHandler();
