import { REPOSITORY_URL } from "./model";

export interface LatestRelease {
  version: string;
  url: string;
}

const repository = new URL(REPOSITORY_URL);
const repositoryPath = repository.pathname.replace(/\/$/, "");
const latestReleaseUrl = `https://api.github.com/repos${repositoryPath}/releases/latest`;

interface ParsedVersion {
  core: [number, number, number];
  prerelease: Array<string | number> | null;
}

function parseVersion(value: string): ParsedVersion | null {
  const match =
    /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/i.exec(
      value.trim(),
    );
  if (!match) return null;

  const core = [Number(match[1]), Number(match[2]), Number(match[3])] as const;
  if (core.some((part) => !Number.isSafeInteger(part))) return null;
  const prerelease = match[4]
    ? match[4]
        .split(".")
        .map((part) =>
          /^\d+$/.test(part) && Number.isSafeInteger(Number(part))
            ? Number(part)
            : part,
        )
    : null;
  if (prerelease?.some((part) => part === "")) return null;
  return { core: [...core], prerelease };
}

/** Compare semantic versions; invalid values compare equal and never trigger an update. */
export function compareVersions(left: string, right: string): number {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (!a || !b) return 0;

  for (let index = 0; index < 3; index++) {
    if (a.core[index] !== b.core[index]) return a.core[index] - b.core[index];
  }
  if (!a.prerelease && !b.prerelease) return 0;
  if (!a.prerelease) return 1;
  if (!b.prerelease) return -1;

  const length = Math.max(a.prerelease.length, b.prerelease.length);
  for (let index = 0; index < length; index++) {
    const leftPart = a.prerelease[index];
    const rightPart = b.prerelease[index];
    if (leftPart === undefined) return -1;
    if (rightPart === undefined) return 1;
    if (leftPart === rightPart) continue;
    if (typeof leftPart === "number" && typeof rightPart === "number") {
      return leftPart - rightPart;
    }
    if (typeof leftPart === "number") return -1;
    if (typeof rightPart === "number") return 1;
    return leftPart.localeCompare(rightPart);
  }
  return 0;
}

/** Read the repository's latest public, non-draft, non-prerelease GitHub release. */
export async function fetchLatestRelease(
  signal?: AbortSignal,
): Promise<LatestRelease | null> {
  const response = await fetch(latestReleaseUrl, {
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    cache: "no-store",
    signal,
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`GitHub 更新检查失败（HTTP ${response.status}）`);
  }

  const value: unknown = await response.json();
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("GitHub 返回的发行版信息无法读取");
  }
  const release = value as Record<string, unknown>;
  const version = typeof release.tag_name === "string" ? release.tag_name : "";
  const url = typeof release.html_url === "string" ? release.html_url : "";
  const parsedUrl = (() => {
    try {
      return new URL(url);
    } catch {
      return null;
    }
  })();
  if (
    !parseVersion(version) ||
    !parsedUrl ||
    parsedUrl.protocol !== "https:" ||
    parsedUrl.hostname !== repository.hostname ||
    !parsedUrl.pathname.startsWith(`${repositoryPath}/releases/`)
  ) {
    throw new Error("GitHub 返回了无效的发行版信息");
  }
  return { version: version.replace(/^v/i, ""), url: parsedUrl.href };
}
