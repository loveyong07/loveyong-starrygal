/** Public identity. Keep storage identifiers stable when changing branding. */
import { version } from "../../package.json";

const GITHUB_USERNAME = "loveyong07";
const REPOSITORY_URL = "https://github.com/loveyong07/loveyong-starrygal";

export const BRAND = {
  name: "loveyong-starrygal",
  latinName: "StarryGal",
  title: "loveyong-starrygal · 你的故事收藏馆",
  tagline: "把故事，收进日常。",
  icon: "/brand/opengal.png",
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
