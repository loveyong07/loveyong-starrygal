/** Appearance is normalized separately from storage so old preferences remain usable. */
export interface Appearance {
  opacity: number;
  blur: number;
  wallpaperOpacity: number;
  contentOpacity: number;
  particles: boolean;
  reduceMotion: boolean;
  palette: "blue" | "lilac" | "rose";
  wallpaper: string;
}

export const defaultAppearance: Appearance = {
  opacity: 38,
  blur: 6,
  wallpaperOpacity: 100,
  contentOpacity: 0,
  particles: true,
  reduceMotion: false,
  palette: "blue",
  wallpaper: "",
};

function bounded(value: unknown, fallback: number, max = 100): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(max, value))
    : fallback;
}

export function normalizeAppearance(value: unknown): Appearance {
  const saved =
    value && typeof value === "object" ? (value as Partial<Appearance>) : {};
  return {
    opacity: bounded(saved.opacity, defaultAppearance.opacity),
    blur: bounded(saved.blur, defaultAppearance.blur, 24),
    wallpaperOpacity: bounded(saved.wallpaperOpacity, 100),
    contentOpacity: bounded(saved.contentOpacity, 0),
    particles: typeof saved.particles === "boolean" ? saved.particles : true,
    reduceMotion: saved.reduceMotion === true,
    palette:
      saved.palette === "lilac" || saved.palette === "rose"
        ? saved.palette
        : "blue",
    wallpaper:
      typeof saved.wallpaper === "string" &&
      (/^data:image\/(png|jpeg|webp);base64,/.test(saved.wallpaper) ||
        saved.wallpaper === "preview-media://wallpaper")
        ? saved.wallpaper
        : "",
  };
}

// Presets change materials only. They never replace the user's image or theme.
export const GLASS_PRESETS = [
  {
    name: "通透",
    description: "让壁纸透进来",
    values: { opacity: 18, blur: 3, contentOpacity: 0, wallpaperOpacity: 100 },
  },
  {
    name: "柔和",
    description: "光影与阅读之间",
    values: { opacity: 38, blur: 8, contentOpacity: 8, wallpaperOpacity: 100 },
  },
  {
    name: "阅读",
    description: "给文字多一点衬托",
    values: { opacity: 60, blur: 14, contentOpacity: 32, wallpaperOpacity: 85 },
  },
] as const;
