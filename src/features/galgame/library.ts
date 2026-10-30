import { isTauri } from "@tauri-apps/api/core";
import {
  gameCreate,
  gameDelete,
  gameUpdate,
  gamesList,
  gamesTagsGet,
  tagsList,
  settingsGet,
  settingsGetAll,
  settingsSet,
  settingsDelete,
} from "@/lib/db";
import type { Game, GameInput, GamePatch } from "@/types/game";
import {
  extras,
  executableName,
  installFolder,
  normalizedPath,
  normalizeTags,
  statusOf,
  type GameExtras,
  type LibraryGame,
} from "./model";

export { isGameExecutable } from "./model";
export const titleFromPath = executableName;
export const folderFromPath = installFolder;
export const desktop = isTauri();
// Preserve the user's existing preview library when adopting the new project name.
const LIBRARY_KEY = "galgame.preview.library.v1";
const PREFS_KEY = "galgame.studio.appearance.v1";
const EXTRA_PREFIX = "opengal.game.";
const MEDIA_DB = "starrygal.preview.media.v1";
const MEDIA_STORE = "assets";
const COVER_REF = "preview-media://cover/";
const WALLPAPER_REF = "preview-media://wallpaper";

let mediaDatabase: Promise<IDBDatabase> | null = null;
const mediaObjectUrls = new Map<string, string>();

function openMediaDatabase(): Promise<IDBDatabase> {
  if (!mediaDatabase) {
    mediaDatabase = new Promise((resolve, reject) => {
      if (typeof indexedDB === "undefined") {
        reject(new Error("当前环境不支持本地图片存储。"));
        return;
      }
      const request = indexedDB.open(MEDIA_DB, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(MEDIA_STORE))
          request.result.createObjectStore(MEDIA_STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        mediaDatabase = null;
        reject(request.error || new Error("无法打开本地图片存储。"));
      };
      request.onblocked = () => {
        mediaDatabase = null;
        reject(new Error("本地图片存储正在升级，请刷新页面后重试。"));
      };
    });
  }
  return mediaDatabase;
}

async function readMedia(key: string): Promise<Blob | undefined> {
  const database = await openMediaDatabase();
  return new Promise((resolve, reject) => {
    const request = database
      .transaction(MEDIA_STORE, "readonly")
      .objectStore(MEDIA_STORE)
      .get(key);
    request.onsuccess = () => resolve(request.result as Blob | undefined);
    request.onerror = () =>
      reject(request.error || new Error("图片读取失败。"));
  });
}

function revokeMediaUrl(key: string) {
  const previous = mediaObjectUrls.get(key);
  if (previous) URL.revokeObjectURL(previous);
  mediaObjectUrls.delete(key);
}

async function writeMedia(key: string, blob: Blob): Promise<void> {
  const database = await openMediaDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(MEDIA_STORE, "readwrite");
    transaction.objectStore(MEDIA_STORE).put(blob, key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error || new Error("图片保存失败。"));
    transaction.onabort = () =>
      reject(transaction.error || new Error("图片保存失败。"));
  });
  revokeMediaUrl(key);
}

async function deleteMedia(key: string): Promise<void> {
  const database = await openMediaDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(MEDIA_STORE, "readwrite");
    transaction.objectStore(MEDIA_STORE).delete(key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error || new Error("图片清理失败。"));
    transaction.onabort = () =>
      reject(transaction.error || new Error("图片清理失败。"));
  });
}

function mediaUrl(key: string, blob: Blob): string {
  const previous = mediaObjectUrls.get(key);
  if (previous) return previous;
  const url = URL.createObjectURL(blob);
  mediaObjectUrls.set(key, url);
  return url;
}

export async function savePreviewCover(
  gameId: number,
  image: Blob,
): Promise<string> {
  const key = `cover:${gameId}`;
  await writeMedia(key, image);
  return mediaUrl(key, image);
}

export async function clearPreviewCover(gameId: number): Promise<void> {
  const key = `cover:${gameId}`;
  await deleteMedia(key);
  revokeMediaUrl(key);
}

export async function savePreviewWallpaper(image: Blob): Promise<string> {
  await writeMedia("wallpaper", image);
  return mediaUrl("wallpaper", image);
}

export async function clearPreviewWallpaper(): Promise<void> {
  await deleteMedia("wallpaper");
  revokeMediaUrl("wallpaper");
}

export interface Appearance {
  opacity: number;
  blur: number;
  particles: boolean;
  palette: "blue" | "lilac" | "rose";
  wallpaper: string;
}
export const defaultAppearance: Appearance = {
  opacity: 38,
  blur: 6,
  particles: true,
  palette: "blue",
  wallpaper: "",
};

export function loadAppearance(): Appearance {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS_KEY) || "{}");
    return {
      opacity: Number.isFinite(saved.opacity)
        ? Math.max(12, Math.min(75, saved.opacity))
        : 38,
      blur: Number.isFinite(saved.blur)
        ? Math.max(0, Math.min(24, saved.blur))
        : 6,
      particles: typeof saved.particles === "boolean" ? saved.particles : true,
      palette: ["blue", "lilac", "rose"].includes(saved.palette)
        ? saved.palette
        : "blue",
      wallpaper:
        typeof saved.wallpaper === "string" &&
        (/^data:image\/(png|jpeg|webp);base64,/.test(saved.wallpaper) ||
          saved.wallpaper === WALLPAPER_REF)
          ? saved.wallpaper
          : "",
    };
  } catch {
    return { ...defaultAppearance };
  }
}
export function saveAppearance(value: Appearance) {
  localStorage.setItem(
    PREFS_KEY,
    JSON.stringify({
      ...value,
      wallpaper: value.wallpaper.startsWith("blob:")
        ? WALLPAPER_REF
        : value.wallpaper,
    }),
  );
}

export async function loadAppearanceWallpaper(): Promise<string> {
  let saved: Record<string, unknown>;
  try {
    saved = JSON.parse(localStorage.getItem(PREFS_KEY) || "{}");
  } catch {
    return "";
  }
  const value = saved.wallpaper;
  if (value === WALLPAPER_REF) {
    const blob = await readMedia("wallpaper").catch(() => undefined);
    return blob ? mediaUrl("wallpaper", blob) : "";
  }
  if (
    typeof value !== "string" ||
    !/^data:image\/(png|jpeg|webp);base64,/.test(value)
  )
    return "";
  try {
    const blob = await fetch(value).then((response) => response.blob());
    await writeMedia("wallpaper", blob);
    localStorage.setItem(
      PREFS_KEY,
      JSON.stringify({ ...saved, wallpaper: WALLPAPER_REF }),
    );
    return mediaUrl("wallpaper", blob);
  } catch {
    return value;
  }
}
export async function readPreference(key: string): Promise<string | null> {
  if (desktop) return settingsGet("opengal." + key);
  try {
    return localStorage.getItem("opengal." + key);
  } catch {
    return null;
  }
}
export async function writePreference(
  key: string,
  value: string,
): Promise<void> {
  if (desktop) await settingsSet("opengal." + key, value);
  else localStorage.setItem("opengal." + key, value);
}

function normalizeGame(game: Game, value: unknown = game): LibraryGame {
  const extra = extras(value);
  const normalized = {
    ...game,
    ...extra,
    favorite: game.favorite === 1 ? 1 : 0,
    playTimeSeconds: Number.isFinite(game.playTimeSeconds)
      ? game.playTimeSeconds
      : 0,
  };
  return { ...normalized, status: statusOf(normalized) };
}
function readPreview(): LibraryGame[] {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(LIBRARY_KEY) || "[]",
    );
    if (!Array.isArray(value)) return [];
    return value
      .filter(
        (g): g is Game =>
          g &&
          typeof g.id === "number" &&
          typeof g.title === "string" &&
          typeof g.installPath === "string",
      )
      .map((game) => normalizeGame(game));
  } catch {
    return [];
  }
}
function writePreview(games: LibraryGame[]) {
  localStorage.setItem(
    LIBRARY_KEY,
    JSON.stringify(
      games.map((game) => ({
        ...game,
        ...(game.customCoverPath?.startsWith("blob:")
          ? { customCoverPath: COVER_REF + game.id }
          : {}),
      })),
    ),
  );
}

async function hydratePreviewMedia(
  games: LibraryGame[],
): Promise<LibraryGame[]> {
  let migrated = false;
  const hydrated = await Promise.all(
    games.map(async (game) => {
      const path = game.customCoverPath;
      if (typeof path !== "string") return game;
      const key = `cover:${game.id}`;
      if (path === COVER_REF + game.id) {
        const blob = await readMedia(key).catch(() => undefined);
        return blob ? { ...game, customCoverPath: mediaUrl(key, blob) } : game;
      }
      if (!/^data:image\//.test(path)) return game;
      try {
        const blob = await fetch(path).then((response) => response.blob());
        await writeMedia(key, blob);
        migrated = true;
        return { ...game, customCoverPath: mediaUrl(key, blob) };
      } catch {
        return game;
      }
    }),
  );
  if (migrated) writePreview(hydrated);
  return hydrated;
}

export async function listGames(): Promise<LibraryGame[]> {
  if (!desktop) return hydratePreviewMedia(readPreview());
  const [games, links, tags, settings] = await Promise.all([
    gamesList(),
    gamesTagsGet(),
    tagsList(),
    settingsGetAll(),
  ]);
  const names = new Map(tags.map((tag) => [tag.id, tag.name]));
  const perGame = new Map<number, string[]>();
  for (const [gameId, tagId] of links) {
    const name = names.get(tagId);
    if (name) perGame.set(gameId, [...(perGame.get(gameId) || []), name]);
  }
  const extraValues = new Map(
    settings
      .filter((setting) => setting.key.startsWith(EXTRA_PREFIX))
      .map((setting) => [
        Number(setting.key.slice(EXTRA_PREFIX.length)),
        setting.value,
      ]),
  );
  return games.map((game) => {
    let value = {};
    try {
      value = JSON.parse(extraValues.get(game.id) || "{}");
    } catch {
      /* Keep core records readable. */
    }
    return normalizeGame(game, {
      ...extras(value),
      tags: perGame.get(game.id) || [],
    });
  });
}

type Input = Omit<GameInput, "tags"> & Partial<GameExtras>;
type Patch = Omit<GamePatch, "tags"> & Partial<GameExtras>;

export async function addGame(input: Input): Promise<LibraryGame> {
  const title = input.title.trim();
  if (!title) throw new Error("请填写游戏的正确名称。");
  const existing = await listGames();
  if (
    existing.some(
      (game) =>
        (input.installPath !== "." &&
          normalizedPath(game.installPath) ===
            normalizedPath(input.installPath)) ||
        (input.exePath &&
          game.exePath &&
          normalizedPath(game.exePath) === normalizedPath(input.exePath)),
    )
  ) {
    throw new Error("这部游戏已经在收藏中了。");
  }
  const extra = extras(input);
  const {
    tags: _tags,
    videoUrl: _video,
    customCoverPath: _customCover,
    visitedAt: _visit,
    source: _source,
    steamAppId: _steam,
    touchgalId: _touchgalId,
    touchgalUrl: _touchgalUrl,
    sourceTitle: _sourceTitle,
    communityRating: _communityRating,
    communityRatingCount: _communityRatingCount,
    ...core
  } = input;
  if (desktop) {
    const game = await gameCreate({ ...core, title, tagNames: extra.tags });
    await settingsSet(EXTRA_PREFIX + game.id, JSON.stringify(extra));
    return normalizeGame(game, extra);
  }
  const now = new Date().toISOString();
  const game: Game = {
    id: Math.max(0, ...existing.map((g) => g.id)) + 1,
    title,
    originalTitle: input.originalTitle || null,
    developer: input.developer || null,
    releaseDate: input.releaseDate || null,
    status: input.status || "unplayed",
    rating: input.rating ?? null,
    favorite: 0,
    coverPath: input.coverPath || null,
    description: input.description || null,
    installPath: input.installPath,
    exePath: input.exePath || null,
    launchArgs: input.launchArgs || null,
    workdir: null,
    savePath: null,
    playTimeSeconds: 0,
    lastPlayedAt: null,
    notes: null,
    vndbId: null,
    bangumiId: null,
    createdAt: now,
    updatedAt: now,
  };
  const complete = normalizeGame(game, extra);
  writePreview([...existing, complete]);
  return complete;
}

export async function updateGame(
  id: number,
  patch: Patch,
): Promise<LibraryGame> {
  const games = await listGames();
  const original = games.find((game) => game.id === id);
  if (!original) throw new Error("这部游戏已不在游戏库中。");
  const nextExtra = extras({ ...original, ...patch });
  if (desktop) {
    const {
      tags,
      videoUrl: _video,
      customCoverPath: _customCover,
      visitedAt: _visit,
      source: _source,
      steamAppId: _steam,
      touchgalId: _touchgalId,
      touchgalUrl: _touchgalUrl,
      sourceTitle: _sourceTitle,
      communityRating: _communityRating,
      communityRatingCount: _communityRatingCount,
      ...core
    } = patch;
    const game = await gameUpdate(id, {
      ...core,
      ...(tags !== undefined
        ? { tags: [], tagNames: normalizeTags(tags) }
        : {}),
    });
    await settingsSet(EXTRA_PREFIX + id, JSON.stringify(nextExtra));
    return normalizeGame(game, nextExtra);
  }
  const updated = normalizeGame(
    { ...original, ...patch, updatedAt: new Date().toISOString() },
    nextExtra,
  );
  writePreview(games.map((game) => (game.id === id ? updated : game)));
  return updated;
}

export async function removeGame(id: number) {
  if (desktop) {
    await gameDelete(id);
    await settingsDelete(EXTRA_PREFIX + id).catch(() => {});
  } else {
    writePreview((await listGames()).filter((game) => game.id !== id));
    await clearPreviewCover(id).catch(() => {});
  }
}
