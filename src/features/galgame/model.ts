import type { Game, GameStatus } from "../../types/game.ts";

export const PROJECT_NAME = "loveyong-starrygal";
export const REPOSITORY_URL =
  "https://github.com/loveyong07/loveyong-starrygal";
export const DOWNLOAD_URL = REPOSITORY_URL + "/releases";
export const CONTACT_URL = "https://loveyong07.top/contact";
// Increment only when the announcement itself changes so each notice is shown once.
export const NOTICE_VERSION = "8";
// Permanent announcement. Future releases must only edit NOTICE_UPDATES below.
export const NOTICE_TEXT =
  "本启动器完全开源免费，请使用时务必将游戏名称填入正确的名称，以便于自动导入";
export const NOTICE_UPDATES = [
  "新增「晴昼 / 星夜 / 跟随系统」外观模式，全面升级通透玻璃光学层次与文学衬线标题排版，启动、关闭与所有功能弹窗统一为毛玻璃视觉。",
  "「最近打开」升级为首屏继续故事焦点横幅，游戏库网格改为纯粹海报流与悬停零位移快捷启动，无封面作品支持星云渐变首字占位。",
  "详情页加入作品专属柔焦氛围背景、吸顶启动栏、键盘翻页截图灯箱与只读标签中文映射，并温和展示故事游玩足迹。",
  "桌面版在详情页「启动与辅助」中唤醒内置 Locale Emulator 日区转区与 Magpie 全屏超分，新增「存档备份」快照与左下角「路径检查与修复」，并支持检测 Steam 游戏真实运行进程统计游玩时长。",
];

export type LibraryDensity = "compact" | "large";

/** Retired medium covers and missing preferences use the small-cover layout. */
export function normalizeLibraryDensity(value: unknown): LibraryDensity {
  return value === "large" ? "large" : "compact";
}

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

const ARTWORK_PALETTES: ReadonlyArray<readonly [number, number]> = [
  [212, 242],
  [250, 282],
  [326, 352],
  [194, 222],
  [228, 262],
  [340, 20],
];

/** Deterministic nebula gradient hues and monogram for games without a cover. */
export function artworkPalette(title: string): {
  hueA: number;
  hueB: number;
  monogram: string;
} {
  const trimmed = title.trim();
  let hash = 2166136261;
  for (const ch of trimmed) {
    hash ^= ch.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  const [hueA, hueB] =
    ARTWORK_PALETTES[hash % ARTWORK_PALETTES.length] ?? ARTWORK_PALETTES[0];
  const cleaned = trimmed.replace(
    /^[\s「『《【（(\[【·—\-~!！?？.。]+/u,
    "",
  );
  const first = Array.from(cleaned || trimmed)[0] || "星";
  return {
    hueA,
    hueB,
    monogram: /[a-z]/i.test(first) ? first.toUpperCase() : first,
  };
}

function formatFootprintDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}.${month}.${day}`;
}

function formatFootprintDuration(seconds: number): string {
  const totalMinutes = Math.max(0, Math.floor(seconds / 60));
  if (totalMinutes < 60) return `${Math.max(1, totalMinutes)} 分钟`;
  const hours = totalMinutes / 60;
  return `${hours >= 10 ? Math.round(hours) : hours.toFixed(1)} 小时`;
}

/** Gentle, read-only story footprint summary derived from session history. */
export function formatStoryFootprint(input: {
  createdAt?: string | null;
  lastPlayedAt?: string | null;
  firstSessionAt?: string | null;
  status: GameStatus;
  playTimeSeconds: number;
  sessionCount?: number;
}): string {
  const createdDate = formatFootprintDate(input.createdAt) || "近日";
  const firstDate =
    formatFootprintDate(input.firstSessionAt) ||
    formatFootprintDate(input.lastPlayedAt) ||
    createdDate;
  const sessionCount = input.sessionCount ?? 0;
  if (input.playTimeSeconds > 0 || sessionCount > 0) {
    const parts = [`初遇于 ${firstDate}`];
    if (input.playTimeSeconds > 0) {
      parts.push(`已陪伴 ${formatFootprintDuration(input.playTimeSeconds)}`);
    } else {
      parts.push(`共 ${sessionCount} 段启动记录`);
    }
    if (sessionCount > 1 && input.playTimeSeconds > 0) {
      parts.push(`共 ${sessionCount} 段时光`);
    }
    if (input.status === "completed") {
      parts.push("已通关收藏");
    }
    return parts.join(" · ");
  }
  if (input.status === "completed") {
    return `收录于 ${createdDate} · 已走完这段旅程`;
  }
  return `收录于 ${createdDate} · 等待翻开第一页`;
}
