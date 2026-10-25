import type { Game, GameStatus } from "../../types/game.ts";

export const PROJECT_NAME = "loveyong-starrygal";
export const REPOSITORY_URL = "https://github.com/loveyong07/loveyong-starrygal";
export const DOWNLOAD_URL = REPOSITORY_URL + "/releases";
export const CONTACT_URL = "https://loveyong07.top/contact";
export const NOTICE_VERSION = "1";
export const NOTICE_TEXT =
  "本启动器完全开源免费，请使用时务必将游戏名称填入正确的名称，以便于自动导入";

export interface GameExtras {
  tags: string[];
  videoUrl: string | null;
  visitedAt: string | null;
  source: "local" | "steam";
  steamAppId: string | null;
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

export function noticeNeeded(seen: unknown) {
  return seen !== NOTICE_VERSION;
}
