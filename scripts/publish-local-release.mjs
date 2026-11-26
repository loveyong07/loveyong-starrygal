import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));
const skipBuild = args.has("--skip-build");
const dryRun = args.has("--dry-run");

function runCapture(command, commandArgs, cwd = rootDir) {
  return execFileSync(command, commandArgs, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function runInherited(command, commandArgs, { cwd = rootDir, useShell = false } = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd,
    stdio: "inherit",
    shell: useShell,
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runPnpm(pnpmArgs) {
  runInherited("pnpm", pnpmArgs, {
    cwd: rootDir,
    useShell: process.platform === "win32",
  });
}

function resolveOriginRepo() {
  const remoteUrl = runCapture("git", ["remote", "get-url", "origin"]);
  const match = /github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/i.exec(remoteUrl);
  if (!match) {
    throw new Error(`Could not parse GitHub repository from origin URL: ${remoteUrl}`);
  }
  return match[1];
}

function sha256File(filePath) {
  const hash = createHash("sha256");
  hash.update(readFileSync(filePath));
  return hash.digest("hex").toLowerCase();
}

const pkg = JSON.parse(readFileSync(resolve(rootDir, "package.json"), "utf8"));
const version = pkg.version;
const tagName = `v${version}`;
const repo = resolveOriginRepo();

console.log(`Target repository: ${repo} (${tagName})`);
runInherited("node", ["scripts/verify-release.mjs"]);
runInherited("node", ["scripts/check-ipc-contract.mjs"]);

const trackedDirty = runCapture("git", [
  "status",
  "--porcelain",
  "--untracked-files=no",
]);
if (trackedDirty) {
  if (dryRun) {
    console.log("[dry-run] Tracked working tree has uncommitted changes (would block live publish).");
  } else {
    throw new Error(
      "Tracked working tree has uncommitted changes. Commit your release changes before running pnpm release:local.",
    );
  }
}

const releasesJson = runCapture("gh", [
  "api",
  `repos/${repo}/releases?per_page=30`,
]);
const releases = JSON.parse(releasesJson);
const existingRelease = releases.find((item) => item.tag_name === tagName);
if (existingRelease) {
  if (dryRun) {
    console.log(
      `[dry-run] Release ${tagName} already exists on ${repo}; continuing local artifact staging check.`,
    );
  } else {
    throw new Error(
      `Release ${tagName} already exists on ${repo}. Bump the version before publishing a new release.`,
    );
  }
}

if (!skipBuild && !dryRun) {
  runPnpm(["typecheck"]);
  runPnpm(["test"]);
  runInherited("cargo", ["test", "--lib", "--bins", "--locked"], {
    cwd: resolve(rootDir, "src-tauri"),
  });
  runPnpm(["tauri", "build", "--bundles", "nsis", "--ci"]);
} else if (skipBuild) {
  console.log("Skipping local test & Tauri build (--skip-build).");
} else {
  console.log("[dry-run] Skipping test & Tauri build.");
}

const nsisInstallerPath = resolve(
  rootDir,
  `src-tauri/target/release/bundle/nsis/StarryGal_${version}_x64-setup.exe`,
);
const portableBinaryPath = resolve(rootDir, "src-tauri/target/release/StarryGal.exe");

if (!existsSync(nsisInstallerPath)) {
  throw new Error(`Missing NSIS installer: ${nsisInstallerPath}`);
}
if (!existsSync(portableBinaryPath)) {
  throw new Error(`Missing portable executable: ${portableBinaryPath}`);
}

const distDir = resolve(rootDir, "src-tauri/target/release/dist");
mkdirSync(distDir, { recursive: true });

const setupFileName = `StarryGal_${version}_windows_x64_setup.exe`;
const portableFileName = `StarryGal_${version}_windows_x64_portable.exe`;
const stagedSetupPath = resolve(distDir, setupFileName);
const stagedPortablePath = resolve(distDir, portableFileName);
const stagedSumsPath = resolve(distDir, "SHA256SUMS.txt");

copyFileSync(nsisInstallerPath, stagedSetupPath);
copyFileSync(portableBinaryPath, stagedPortablePath);

const checksumLines = [
  `${sha256File(stagedPortablePath)}  ${portableFileName}`,
  `${sha256File(stagedSetupPath)}  ${setupFileName}`,
];
writeFileSync(stagedSumsPath, `${checksumLines.join("\n")}\n`, "utf8");

console.log(`Staged assets in ${distDir}:`);
console.log(`  - ${portableFileName} (${statSync(stagedPortablePath).size} bytes)`);
console.log(`  - ${setupFileName} (${statSync(stagedSetupPath).size} bytes)`);
for (const line of checksumLines) {
  console.log(`  - ${line}`);
}

if (dryRun) {
  console.log(`[dry-run] Verified staging without pushing git or publishing ${tagName} to ${repo}.`);
  process.exit(0);
}

console.log(`Pushing current HEAD to ${repo} main...`);
runInherited("git", ["push", "origin", "HEAD:main"]);
const headSha = runCapture("git", ["rev-parse", "HEAD"]);

console.log(`Creating draft release ${tagName} on ${repo} (${headSha})...`);
runInherited("gh", [
  "release",
  "create",
  tagName,
  "--repo",
  repo,
  "--draft",
  "--target",
  headSha,
  "--title",
  `StarryGal ${tagName}`,
  "--notes-file",
  "RELEASE.md",
]);

console.log(`Uploading release assets to ${tagName}...`);
runInherited("gh", [
  "release",
  "upload",
  tagName,
  "--repo",
  repo,
  stagedSetupPath,
  stagedPortablePath,
  stagedSumsPath,
]);

console.log(`Publishing ${tagName}...`);
runInherited("gh", [
  "release",
  "edit",
  tagName,
  "--repo",
  repo,
  "--draft=false",
  "--latest",
]);

console.log(`Published https://github.com/${repo}/releases/tag/${tagName}`);
