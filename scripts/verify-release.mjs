import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) =>
  readFileSync(new URL("../" + path, import.meta.url), "utf8");
const pkg = JSON.parse(read("package.json"));
const tauri = JSON.parse(read("src-tauri/tauri.conf.json"));
const cargo = /\[package\][\s\S]*?\nversion = "([^"]+)"/.exec(
  read("src-tauri/Cargo.toml"),
);
const lock = /name = "loveyong-starrygal"\r?\nversion = "([^"]+)"/.exec(
  read("src-tauri/Cargo.lock"),
);
assert.equal(tauri.productName, "StarryGal");
assert.equal(tauri.version, pkg.version);
assert.equal(cargo?.[1], pkg.version);
assert.equal(lock?.[1], pkg.version);
assert.equal(tauri.bundle.windows.nsis.installMode, "currentUser");
assert.ok(tauri.bundle.windows.nsis.languages.includes("SimpChinese"));
assert.ok(read("RELEASE.md").includes(`v${pkg.version}`));
assert.equal(
  tauri.bundle.createUpdaterArtifacts,
  false,
  "No updater artifacts until a signing key and verified update endpoint are configured",
);
console.log(
  `StarryGal v${pkg.version}: versions and Windows packaging configuration agree.`,
);
