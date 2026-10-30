import { mediaUrl, normalizeTags, type LibraryGame } from "./model.ts";
import type { GameMetadata, GameMetadataProvider } from "./metadata.ts";
import { parseTouchGalIntroduction } from "./touchgal-introduction.ts";
import { sameGameTitle, titleSearchKeywords } from "./title-matching.ts";

export const DEFAULT_TOUCHGAL_ENDPOINT = "https://loveyong07.top/api/starrygal";
export const TOUCHGAL_TOKEN_DOCS_URL =
  "https://developer.touchgal.com/docs/api";
export type TouchGalAction =
  "status" | "search" | "detail" | "resources" | "patches";
export interface TouchGalRequest {
  endpoint: string;
  action: TouchGalAction;
  keyword?: string;
  uniqueId?: string;
  page?: number;
  allowNsfw: boolean;
  apiToken?: string;
}
export type TouchGalTransport = (
  request: TouchGalRequest,
  signal: AbortSignal,
) => Promise<unknown>;
export interface TouchGalCandidate {
  name: string;
  uniqueId: string;
}
export interface TouchGalResource {
  name: string;
  description: string;
  sizes: string[];
  deepLink: string;
}
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const string = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";
const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.map(string).filter(Boolean) : [];

function searchName(keyword: string): string {
  const name = keyword.trim();
  if ([...name].length < 3 || [...name].length > 100)
    throw new Error(
      "请填写 3～100 个字符的游戏名称，短标题可尝试原名或完整名称。",
    );
  return name;
}

export function validateEndpoint(value: string): string {
  const url = new URL(value.trim() || DEFAULT_TOUCHGAL_ENDPOINT);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error("资料接口需要不含账号、参数和片段的 HTTPS 地址。");
  return url.href.replace(/\/$/, "");
}

export function validateToken(value: string): string {
  const trimmed = value
    .trim()
    .replace(/^Bearer\s+/i, "")
    .trim();
  if (!trimmed) return "";
  if (trimmed.length > 512 || /[\r\n\s]/.test(trimmed))
    throw new Error("请填写不含空格或换行的有效 TouchGal Token。");
  return trimmed;
}

export function touchgalLink(value: unknown): string | null {
  const safe = mediaUrl(value);
  if (!safe) return null;
  const url = new URL(safe);
  return url.protocol === "https:" &&
    !url.username &&
    !url.password &&
    /(^|\.)touchgal\.(ink|com)$/.test(url.hostname)
    ? url.href
    : null;
}

export function unwrapTouchGal(value: unknown): Record<string, unknown> {
  const envelope = object(value);
  if (envelope.success !== true) {
    const code = string(object(envelope.error).code);
    const messages: Record<string, string> = {
      UNAUTHORIZED:
        "TouchGal 密钥无效，请检查资料设置中的自定义 Token 或联系维护者。",
      NOT_CONFIGURED:
        "资料服务尚未配置，可在资料设置中填写自定义 Token 或联系维护者。",
      RATE_LIMITED: "资料查询额度暂时用尽，请稍后重试。",
      BAD_REQUEST: "请填写 3～100 个字符的游戏名称。",
      UPSTREAM_UNAVAILABLE: "TouchGal 暂时不可用，请稍后重试。",
      NOT_FOUND: "未找到条目。可检查名称，或在资料设置中允许查询成人分级条目。",
    };
    throw new Error(messages[code] || "资料服务暂时不可用，请稍后重试。");
  }
  return object(envelope.data);
}

export const fetchTouchGal: TouchGalTransport = async (request, signal) => {
  const url = new URL(validateEndpoint(request.endpoint));
  url.searchParams.set("action", request.action);
  url.searchParams.set("allowNsfw", String(request.allowNsfw));
  if (request.keyword) url.searchParams.set("keyword", request.keyword);
  if (request.uniqueId) url.searchParams.set("uniqueId", request.uniqueId);
  if (request.page) url.searchParams.set("page", String(request.page));
  const token = request.apiToken ? validateToken(request.apiToken) : "";
  const response = await fetch(url, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]),
    credentials: "omit",
    headers: {
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!response.headers.get("content-type")?.includes("application/json"))
    throw new Error("资料接口返回的不是 JSON，请检查服务地址或部署状态。");
  return response.json();
};

export function parseTouchGalDetail(value: unknown): GameMetadata {
  const data = object(value);
  const aliases = strings(data.aliases);
  const rating = object(data.rating);
  const average = rating.average;
  const count = rating.count;
  const introduction = parseTouchGalIntroduction(string(data.introduction));
  return {
    title: string(data.name),
    sourceTitle: string(data.name),
    originalTitle:
      aliases.find((name) => /[\u3040-\u30ff]/.test(name)) ||
      aliases[0] ||
      null,
    touchgalId: /^[a-z\d]{8}$/i.test(string(data.uniqueId))
      ? string(data.uniqueId)
      : null,
    touchgalUrl: touchgalLink(data.touchgalUrl),
    coverUrl: mediaUrl(data.bannerUrl),
    description: introduction.description,
    screenshots: introduction.screenshots,
    developer: Array.isArray(data.companies)
      ? data.companies
          .map((company) => string(object(company).name))
          .filter(Boolean)
          .join(" / ") || null
      : null,
    releaseDate: string(data.releaseDate) || null,
    tags: normalizeTags(data.tags),
    communityRating:
      typeof average === "number" &&
      Number.isFinite(average) &&
      average >= 0 &&
      average <= 10
        ? average
        : null,
    communityRatingCount:
      typeof count === "number" && Number.isSafeInteger(count) && count >= 0
        ? count
        : 0,
    // Some entries include a real media URL inside their public introduction.
    videoUrl: introduction.videoUrl,
  };
}

export function metadataPatch(
  game: LibraryGame,
  result: GameMetadata,
  replace = false,
) {
  return {
    ...(!game.videoOverride && (replace || !game.videoUrl) && result.videoUrl
      ? { videoUrl: result.videoUrl }
      : {}),
    ...((replace || !game.screenshots.length) && result.screenshots?.length
      ? { screenshots: result.screenshots }
      : {}),
    ...((replace || !game.originalTitle?.trim()) && result.originalTitle?.trim()
      ? { originalTitle: result.originalTitle.trim() }
      : {}),
    ...((replace || !game.coverPath?.trim()) && result.coverUrl
      ? { coverPath: result.coverUrl }
      : {}),
    ...((replace || !game.description?.trim()) && result.description
      ? { description: result.description }
      : {}),
    ...((replace || !game.developer?.trim()) && result.developer
      ? { developer: result.developer }
      : {}),
    ...((replace || !game.releaseDate?.trim()) && result.releaseDate
      ? { releaseDate: result.releaseDate }
      : {}),
    tags: normalizeTags([...game.tags, ...(result.tags || [])]),
    touchgalId: result.touchgalId || game.touchgalId,
    touchgalUrl: result.touchgalUrl || game.touchgalUrl,
    sourceTitle: result.sourceTitle || game.sourceTitle,
    communityRating: result.communityRating ?? game.communityRating,
    communityRatingCount:
      result.communityRatingCount ?? game.communityRatingCount,
  };
}

export function createTouchGalClient(
  endpoint: string,
  allowNsfw = false,
  transport = fetchTouchGal,
  apiToken = "",
) {
  const base = validateEndpoint(endpoint);
  const token = validateToken(apiToken);
  const request = async (
    action: TouchGalAction,
    params: Partial<TouchGalRequest>,
    signal: AbortSignal,
  ) => {
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    const result = await transport(
      {
        endpoint: base,
        action,
        allowNsfw,
        ...(token ? { apiToken: token } : {}),
        ...params,
      },
      signal,
    );
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    return unwrapTouchGal(result);
  };
  const searchPage = async (keyword: string, signal: AbortSignal, page = 1) => {
    const name = searchName(keyword);
    const data = await request("search", { keyword: name, page }, signal);
    const items: TouchGalCandidate[] = Array.isArray(data.items)
      ? data.items.flatMap((value) => {
          const item = object(value);
          return string(item.name) &&
            /^[a-z\d]{8}$/i.test(string(item.uniqueId))
            ? [{ name: string(item.name), uniqueId: string(item.uniqueId) }]
            : [];
        })
      : [];
    return {
      items,
      hasMore: object(data.pagination).hasMore === true,
      keyword: name,
    };
  };
  const search = async (keyword: string, signal: AbortSignal, page = 1) => {
    // Validate the original query even when it would yield a shorter fallback.
    let result = await searchPage(keyword, signal, page);
    if (page !== 1 || result.items.length || result.hasMore) return result;
    for (const fallback of titleSearchKeywords(keyword).slice(1)) {
      result = await searchPage(fallback, signal);
      if (result.items.length || result.hasMore) break;
    }
    return result;
  };
  const detail = async (uniqueId: string, signal: AbortSignal) => {
    if (!/^[a-z\d]{8}$/i.test(uniqueId))
      throw new Error("无效的 TouchGal 条目编号。");
    const result = parseTouchGalDetail(
      await request("detail", { uniqueId }, signal),
    );
    if (result.touchgalId !== uniqueId || !result.title)
      throw new Error("条目资料不完整，请稍后重试。");
    return result;
  };
  const provider: GameMetadataProvider = {
    async searchByName(name, signal) {
      name = searchName(name);
      const checkedAliases = new Set<string>();
      // Preserve validation and cancellation behavior for the original query.
      const keywords = titleSearchKeywords(name);
      for (const keyword of keywords.length ? keywords : [name]) {
        const { items, hasMore } = await searchPage(keyword, signal);
        const unique = [
          ...new Map(items.map((item) => [item.uniqueId, item])).values(),
        ];
        const matches = unique.filter((item) => sameGameTitle(item.name, name));
        // Multiple matches or an incomplete page require an explicit choice.
        if (matches.length > 1 || (matches.length && hasMore)) return null;
        if (matches.length === 1) return detail(matches[0].uniqueId, signal);
        if (
          unique.length === 1 &&
          !hasMore &&
          !checkedAliases.has(unique[0].uniqueId)
        ) {
          const candidate = unique[0];
          checkedAliases.add(candidate.uniqueId);
          const raw = await request(
            "detail",
            { uniqueId: candidate.uniqueId },
            signal,
          );
          if (string(raw.uniqueId) !== candidate.uniqueId || !string(raw.name))
            throw new Error("条目资料不完整，请稍后重试。");
          if (
            [string(raw.name), ...strings(raw.aliases)].some((alias) =>
              sameGameTitle(alias, name),
            )
          )
            return parseTouchGalDetail(raw);
        }
      }
      return null;
    },
  };
  return {
    provider,
    search,
    detail,
    status: (signal: AbortSignal) => request("status", {}, signal),
    async resources(
      uniqueId: string,
      kind: "resources" | "patches",
      signal: AbortSignal,
    ): Promise<TouchGalResource[]> {
      if (!/^[a-z\d]{8}$/i.test(uniqueId))
        throw new Error("无效的 TouchGal 条目编号。");
      const data = await request(kind, { uniqueId }, signal);
      return Array.isArray(data.items)
        ? data.items.flatMap((value) => {
            const item = object(value);
            const link = touchgalLink(item.deepLink);
            return link
              ? [
                  {
                    name: string(item.name) || "查看资源",
                    description: string(item.description),
                    sizes: strings(item.sizes),
                    deepLink: link,
                  },
                ]
              : [];
          })
        : [];
    },
  };
}

export type TouchGalClient = ReturnType<typeof createTouchGalClient>;
