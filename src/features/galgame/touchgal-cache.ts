import {
  validateEndpoint,
  type TouchGalRequest,
  type TouchGalTransport,
} from "./touchgal.ts";

export interface TouchGalCacheStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const TOUCHGAL_CACHE_PREFIX = "starrygal.touchgal.cache.v1:";

function cacheKey(request: TouchGalRequest): string {
  // Credentials never belong in cache keys or records. Only public metadata
  // is shared between tokens; the service and rating filter stay separate.
  return (
    TOUCHGAL_CACHE_PREFIX +
    JSON.stringify([
      validateEndpoint(request.endpoint),
      request.action,
      request.allowNsfw,
      request.keyword?.trim() ?? null,
      request.uniqueId ?? null,
      request.action === "search" ? (request.page ?? 1) : null,
    ])
  );
}

function validResponse(request: TouchGalRequest, value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const response = value as {
    success?: unknown;
    data?: Record<string, unknown>;
  };
  const data = response.data;
  if (response.success !== true || !data || typeof data !== "object")
    return false;
  const validItem = (item: unknown) => {
    if (!item || typeof item !== "object") return false;
    const row = item as Record<string, unknown>;
    return (
      typeof row.name === "string" &&
      !!row.name.trim() &&
      typeof row.uniqueId === "string" &&
      /^[a-z\d]{8}$/i.test(row.uniqueId)
    );
  };
  return request.action === "search"
    ? Array.isArray(data.items) && data.items.every(validItem)
    : request.action === "detail" &&
        validItem(data) &&
        data.uniqueId === request.uniqueId;
}

function waitForResponse(pending: Promise<unknown>, signal: AbortSignal) {
  return new Promise<unknown>((resolve, reject) => {
    const abort = () => reject(new DOMException("Aborted", "AbortError"));
    if (signal.aborted) {
      abort();
      return;
    }
    signal.addEventListener("abort", abort, { once: true });
    pending.then(
      (value) => {
        signal.removeEventListener("abort", abort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      },
    );
  });
}

/** Browser preview equivalent of the desktop's durable JSON file cache. */
export function createCachedTouchGalTransport(
  transport: TouchGalTransport,
  store: TouchGalCacheStore,
): TouchGalTransport {
  const inFlight = new Map<string, Promise<unknown>>();
  return async (request, signal) => {
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    if (request.action !== "search" && request.action !== "detail")
      return transport(request, signal);
    const key = cacheKey(request);
    if (!request.forceRefresh) {
      try {
        const raw = store.getItem(key);
        const record = raw ? JSON.parse(raw) : null;
        if (record?.version === 1 && validResponse(request, record.response))
          return record.response;
      } catch {
        /* A damaged record must not stop a fresh lookup. */
      }
    }
    let pending = inFlight.get(key);
    if (!pending) {
      // Finish and save an already-spent request even if a dialog closes.
      // Each caller still observes its own abort and never applies late data.
      pending = (async () => {
        const value = await transport(request, new AbortController().signal);
        if (validResponse(request, value)) {
          try {
            store.setItem(
              key,
              JSON.stringify({
                version: 1,
                fetchedAt: new Date().toISOString(),
                response: value,
              }),
            );
          } catch {
            throw new Error(
              "资料已获取，但本地缓存保存失败，请检查浏览器存储空间和权限。",
            );
          }
        }
        return value;
      })();
      inFlight.set(key, pending);
      void pending.finally(() => inFlight.delete(key)).catch(() => {});
    }
    return waitForResponse(pending, signal);
  };
}
