import { test } from "node:test";
import assert from "node:assert/strict";
import {
  defaultAppearance,
  normalizeAppearance,
} from "../src/features/galgame/appearance.ts";

test("existing transparent glass and a personal wallpaper survive the appearance upgrade", () => {
  const old = {
    opacity: 12,
    blur: 0,
    particles: false,
    palette: "rose",
    wallpaper: "preview-media://wallpaper",
  };
  const migrated = normalizeAppearance(old);
  for (const [key, value] of Object.entries(old))
    assert.equal(migrated[key], value);
  assert.equal(migrated.wallpaperOpacity, 100);
  assert.equal(migrated.contentOpacity, 0);
  assert.equal(migrated.reduceMotion, false);
});

test("all three opacity controls retain zero and remain independent", () => {
  const result = normalizeAppearance({
    opacity: 0,
    wallpaperOpacity: 73,
    contentOpacity: 0,
    blur: 0,
  });
  assert.equal(result.opacity, 0);
  assert.equal(result.wallpaperOpacity, 73);
  assert.equal(result.contentOpacity, 0);
  assert.equal(result.blur, 0);
});

test("malformed appearance data and out-of-range values are safe to load", () => {
  assert.deepEqual(normalizeAppearance(null), defaultAppearance);
  const result = normalizeAppearance({
    opacity: -20,
    blur: 80,
    wallpaperOpacity: Infinity,
    contentOpacity: 120,
    particles: "false",
    palette: "unknown",
    wallpaper: "https://example.com/image.jpg",
    reduceMotion: true,
  });
  assert.equal(result.opacity, 0);
  assert.equal(result.blur, 24);
  assert.equal(result.wallpaperOpacity, 100);
  assert.equal(result.contentOpacity, 100);
  assert.equal(result.wallpaper, "");
  assert.equal(result.reduceMotion, true);
  assert.equal(result.particles, true);
});
