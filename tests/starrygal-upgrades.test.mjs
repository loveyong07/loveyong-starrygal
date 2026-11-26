import { test } from "node:test";
import assert from "node:assert/strict";
import { formatStoryTags } from "../src/features/galgame/tag-display.ts";
import {
  artworkPalette,
  formatStoryFootprint,
} from "../src/features/galgame/model.ts";

test("story tags translate known English tags, deduplicate equivalents, and classify meta vs story tags", () => {
  const result = formatStoryTags([
    "2020",
    "ADV",
    "文字冒险",
    "STEAM",
    "Protagonist's Childhood Friend",
    "Childhood Friends",
    "  ",
    "galgame",
  ]);
  assert.deepEqual(
    result.map((t) => [t.label, t.kind]),
    [
      ["2020", "meta"],
      ["文字冒险", "story"],
      ["Steam", "meta"],
      ["Protagonist's Childhood Friend", "story"],
      ["青梅竹马", "story"],
      ["视觉小说", "story"],
    ],
  );
});

test("artwork palette generates deterministic nebula hues and safe monograms", () => {
  const a = artworkPalette("ATRI -My Dear Moments-");
  const b = artworkPalette("ATRI -My Dear Moments-");
  assert.deepEqual(a, b);
  assert.equal(a.monogram, "A");
  assert.equal(artworkPalette("「夏日口袋」").monogram, "夏");
  assert.equal(artworkPalette("   ").monogram, "星");
});

test("story footprint formats unplayed, active, multi-session, completed, and invalid dates cleanly", () => {
  assert.equal(
    formatStoryFootprint({
      createdAt: "2026-11-04T08:00:00Z",
      status: "unplayed",
      playTimeSeconds: 0,
    }),
    "收录于 2026.11.04 · 等待翻开第一页",
  );
  assert.equal(
    formatStoryFootprint({
      createdAt: "2026-11-04T08:00:00Z",
      status: "completed",
      playTimeSeconds: 0,
    }),
    "收录于 2026.11.04 · 已走完这段旅程",
  );
  assert.equal(
    formatStoryFootprint({
      createdAt: "2026-11-01T08:00:00Z",
      firstSessionAt: "2026-11-04T08:00:00Z",
      status: "completed",
      playTimeSeconds: 5400,
      sessionCount: 3,
    }),
    "初遇于 2026.11.04 · 已陪伴 1.5 小时 · 共 3 段时光 · 已通关收藏",
  );
  assert.equal(
    formatStoryFootprint({
      createdAt: "invalid-date",
      status: "unplayed",
      playTimeSeconds: 0,
    }),
    "收录于 近日 · 等待翻开第一页",
  );
});
