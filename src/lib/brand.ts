/** Public identity. Keep storage identifiers stable when changing branding. */
import { version } from "../../package.json";

const GITHUB_USERNAME = "loveyong07";
const REPOSITORY_URL = "https://github.com/loveyong07/loveyong-starrygal";
const ASSET_BASE = import.meta.env.BASE_URL;

export const BRAND = {
  name: "StarryGal",
  latinName: "StarryGal",
  title: "StarryGal · 你的故事收藏馆",
  tagline: "把故事，收进日常。",
  icon: ASSET_BASE + "brand/starrygal-icon.png",
  logo: ASSET_BASE + "brand/starrygal-logo.png",
  wallpaper: ASSET_BASE + "wallpapers/sky-lake.png",
  githubUsername: GITHUB_USERNAME,
  githubUrl: `https://github.com/${GITHUB_USERNAME}`,
  repositoryUrl: REPOSITORY_URL,
  releasesUrl: `${REPOSITORY_URL}/releases`,
  douyinName: "",
  douyinId: "",
  douyinUrl: "",
  license: "GPL-3.0-only",
  communityGroup: "",
  version,
} as const;
