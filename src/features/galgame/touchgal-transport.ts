import { isTauri, invoke } from "@tauri-apps/api/core";
import { fetchTouchGal, type TouchGalTransport } from "./touchgal";
import { createCachedTouchGalTransport } from "./touchgal-cache";

const browserTransport = createCachedTouchGalTransport(fetchTouchGal, {
  getItem: (key) => localStorage.getItem(key),
  setItem: (key, value) => localStorage.setItem(key, value),
});

/** The desktop calls the public relay through Rust; no developer credential enters the WebView. */
export const touchgalTransport: TouchGalTransport = async (request, signal) => {
  if (!isTauri()) return browserTransport(request, signal);
  const result = await invoke("touchgal_request", {
    endpoint: request.endpoint,
    action: request.action,
    keyword: request.keyword ?? null,
    uniqueId: request.uniqueId ?? null,
    page: request.page ?? null,
    allowNsfw: request.allowNsfw,
    apiToken: request.apiToken ?? null,
    forceRefresh: request.forceRefresh ?? false,
  });
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
  return result;
};
