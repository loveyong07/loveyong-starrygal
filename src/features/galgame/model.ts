import type { Game, GameStatus } from "../../types/game.ts";

export const PROJECT_NAME = "loveyong-starrygal";
export const REPOSITORY_URL =
  "https://github.com/loveyong07/loveyong-starrygal";
export const DOWNLOAD_URL = REPOSITORY_URL + "/releases";
export const CONTACT_URL = "https://loveyong07.top/contact";
// Increment only when the announcement itself changes so each notice is shown once.
export const NOTICE_VERSION = "3";
// Permanent announcement. Future releases must only edit NOTICE_UPDATES below.
export const NOTICE_TEXT =
  "本启动器完全开源免费，请使用时务必将游戏名称填入正确的名称，以便于自动导入";
export const NOTICE_UPDATES = [
  "游戏详情页点击封面图片可放大查看完整封面。",
  "记住游戏库排序和网格 / 列表选择，下次打开沿用上次设置。",
  "自动查找过滤补丁、备份等辅助目录，所有扫描结果确认后再加入游戏库。",
  "名称搜索兼容大小写、空格和标点差异；添加游戏可用至少 3 个字符的名称片段或关键词搜索，选中作品后确认添加。",
  "每次进入游戏详情从顶部开始；窗口按钮融入界面，移除系统标题栏。",
  "新版安装包支持在原安装目录覆盖升级，保留设置、游戏库和游玩记录。",
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
