import type { Game, GameStatus } from "../../types/game.ts";

export const PROJECT_NAME = "loveyong-starrygal";
export const REPOSITORY_URL =
  "https://github.com/loveyong07/loveyong-starrygal";
export const DOWNLOAD_URL = REPOSITORY_URL + "/releases";
export const CONTACT_URL = "https://loveyong07.top/contact";
// Increment only when the announcement itself changes so each notice is shown once.
export const NOTICE_VERSION = "6";
// Permanent announcement. Future releases must only edit NOTICE_UPDATES below.
export const NOTICE_TEXT =
  "本启动器完全开源免费，请使用时务必将游戏名称填入正确的名称，以便于自动导入";
export const NOTICE_UPDATES = [
  "游戏库焕新：顶部搜索支持名称、别名、会社和标签，Ctrl+K / Ctrl+F 可快速聚焦。最近打开区和游戏卡片均可直接启动。",
  "通透玻璃继续保留：玻璃、背景和正文底色分别支持 0–100% 即时调节并自动保存，旧外观设置继续沿用。新增通透、柔和、阅读预设。",
  "新增三档封面大小，重启后保留排序与视图；详情返回时恢复原分类、搜索和列表位置。外观与资料设置入口常驻左侧。",
  "优化点击、启动中与运行中反馈，补齐键盘焦点和减少动态效果；详情下滑后提供紧凑启动条，PV 按需加载并可重新加载。",
  "添加游戏支持完整路径拖入，资料补全显示进度、停止和重试。已有游戏库、资料缓存、自定义封面、手动 PV 和游玩记录继续保留。",
];

export interface GameExtras {
  tags: string[];
  videoUrl: string | null;
  videoOverride: boolean;
  screenshots: string[];
  customCoverPath: string | null;
  visitedAt: string | null;
  source: "local" | "steam";
  steamAppId: string | null;
  touchgalId: string | null;
  touchgalUrl: string | null;
  sourceTitle: string | null;
  communityRating: number | null;
  communityRatingCount: number;
}

export interface LibraryGame extends Game, GameExtras {}

export function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value
    .filter((tag): tag is string => typeof tag === "string")
    .map((tag) => tag.trim().slice(0, 30))
    .filter((tag) => {
      const key = tag.toLocaleLowerCase();
      if (!tag || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 20);
}

export function mediaUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const parsed = new URL(value);
    return ["https:", "http:"].includes(parsed.protocol) ? parsed.href : null;
  } catch {
    return null;
  }
}

export function extras(value: unknown): GameExtras {
  const item =
    value && typeof value === "object" ? (value as Partial<GameExtras>) : {};
  return {
    tags: normalizeTags(item.tags),
    videoUrl: mediaUrl(item.videoUrl),
    videoOverride: item.videoOverride === true,
    screenshots: Array.isArray(item.screenshots)
      ? [
          ...new Set(
            item.screenshots.flatMap((value) => {
              const url = mediaUrl(value);
              return url &&
                new URL(url).protocol === "https:" &&
                !new URL(url).username &&
                !new URL(url).password
                ? [url]
                : [];
            }),
          ),
        ].slice(0, 12)
      : [],
    customCoverPath:
      typeof item.customCoverPath === "string" && item.customCoverPath.trim()
        ? item.customCoverPath.trim()
        : null,
    visitedAt:
      typeof item.visitedAt === "string" &&
      Number.isFinite(Date.parse(item.visitedAt))
        ? item.visitedAt
        : null,
    source: item.source === "steam" ? "steam" : "local",
    steamAppId:
      typeof item.steamAppId === "string" && /^[1-9]\d*$/.test(item.steamAppId)
        ? item.steamAppId
        : null,
    touchgalId:
      typeof item.touchgalId === "string" &&
      /^[a-z\d]{8}$/i.test(item.touchgalId)
        ? item.touchgalId
        : null,
    touchgalUrl:
      typeof item.touchgalUrl === "string" &&
      /^https:\/\/(?:[a-z\d-]+\.)*touchgal\.(?:ink|com)\//i.test(
        item.touchgalUrl,
      )
        ? mediaUrl(item.touchgalUrl)
        : null,
    sourceTitle:
      typeof item.sourceTitle === "string"
        ? item.sourceTitle.trim().slice(0, 500) || null
        : null,
    communityRating:
      typeof item.communityRating === "number" &&
      Number.isFinite(item.communityRating) &&
      item.communityRating >= 0 &&
      item.communityRating <= 10
        ? item.communityRating
        : null,
    communityRatingCount:
      typeof item.communityRatingCount === "number" &&
      Number.isSafeInteger(item.communityRatingCount) &&
      item.communityRatingCount >= 0
        ? item.communityRatingCount
        : 0,
  };
}

/** A detail-page visit counts as "playing"; completion is an explicit choice. */
export function statusOf(
  game: Pick<Game, "status" | "lastPlayedAt" | "playTimeSeconds"> & {
    visitedAt?: string | null;
  },
): GameStatus {
  if (game.status === "completed") return "completed";
  return game.status === "playing" ||
    game.visitedAt ||
    game.lastPlayedAt ||
    game.playTimeSeconds > 0
    ? "playing"
    : "unplayed";
}

export function visitPatch(game: LibraryGame, now: string) {
  return {
    status:
      game.status === "completed"
        ? ("completed" as const)
        : ("playing" as const),
    visitedAt: now,
  };
}

export function completionPatch(game: LibraryGame, complete: boolean) {
  return {
    status: complete
      ? ("completed" as const)
      : statusOf({ ...game, status: "unplayed" }),
  };
}

export function normalizedPath(path: string) {
  return path
    .trim()
    .replace(/\//g, "\\")
    .replace(/\\+$/, "")
    .toLocaleLowerCase();
}

export function executableName(path: string) {
  return (path.split(/[\\/]/).pop() || "").replace(/\.exe$/i, "");
}

export function installFolder(path: string) {
  const index = Math.max(path.lastIndexOf("\\"), path.lastIndexOf("/"));
  return index < 0 ? "." : path.slice(0, index);
}

export const isGameExecutable = (path: string) =>
  /\.exe$/i.test(path) &&
  !/(?:^|[\\/])(unins[^\\/]*|uninstall|setup|install|config|crash[^\\/]*|update[^\\/]*|vcredist[^\\/]*|dxsetup)\.exe$/i.test(
    path,
  );

export function selectedExecutable(value: string): string {
  const path = value.trim().replace(/^"([^"]+)"$/, "$1");
  if (
    !/^(?:[a-z]:[\\/]|\\\\[^\\/]+[\\/][^\\/]+[\\/])/i.test(path) ||
    !/\.exe$/i.test(path) ||
    /[\u0000\r\n]/.test(path)
  )
    throw new Error("请选择游戏启动 EXE 的完整路径。");
  return path;
}

export function noticeNeeded(seen: unknown) {
  return seen !== NOTICE_VERSION;
}
