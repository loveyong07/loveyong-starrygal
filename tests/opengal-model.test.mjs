import { test } from "node:test";
import assert from "node:assert/strict";
import {
  statusOf,
  visitPatch,
  completionPatch,
  normalizeTags,
  mediaUrl,
  extras,
  normalizedPath,
  isGameExecutable,
  noticeNeeded,
  NOTICE_VERSION,
  NOTICE_TEXT,
  PROJECT_NAME,
  REPOSITORY_URL,
  installFolder,
} from "../src/features/galgame/model.ts";

const base = {
  status: "unplayed",
  playTimeSeconds: 0,
  lastPlayedAt: null,
  visitedAt: null,
};

test("new games stay pending, entering details starts them, completion is preserved", () => {
  assert.equal(statusOf(base), "unplayed");
  const visit = visitPatch(base, "2026-10-25T12:00:00Z");
  assert.equal(visit.status, "playing");
  assert.equal(statusOf({ ...base, ...visit }), "playing");
  const completed = { ...base, ...visit, status: "completed" };
  assert.equal(
    visitPatch(completed, "2026-10-25T13:00:00Z").status,
    "completed",
  );
  assert.equal(completionPatch(completed, false).status, "playing");
  assert.equal(
    completionPatch({ ...base, status: "completed" }, false).status,
    "unplayed",
  );
});

test("legacy play records count as playing without fabricating a launch time", () => {
  assert.equal(statusOf({ ...base, playTimeSeconds: 20 }), "playing");
  assert.equal(
    statusOf({ ...base, lastPlayedAt: "2026-10-25T12:00:00Z" }),
    "playing",
  );
  assert.equal(
    "lastPlayedAt" in visitPatch(base, "2026-10-25T12:00:00Z"),
    false,
  );
});

test("tags trim, deduplicate and remain bounded after metadata/manual merging", () => {
  assert.deepEqual(
    normalizeTags([" 恋爱 ", "科幻", "恋爱", "", 3, "SCI-FI", "sci-fi"]),
    ["恋爱", "科幻", "SCI-FI"],
  );
  assert.equal(
    normalizeTags(Array.from({ length: 30 }, (_, i) => "tag-" + i)).length,
    20,
  );
  assert.equal(normalizeTags(["a".repeat(200)])[0].length, 30);
});

test("metadata URLs reject active content and unsupported file/Steam schemes", () => {
  for (const url of [
    "javascript:alert(1)",
    "data:text/html,hello",
    "file:///secret",
    "steam://run/123",
    null,
  ]) {
    assert.equal(mediaUrl(url), null);
  }
  assert.equal(
    mediaUrl("https://example.com/pv.mp4"),
    "https://example.com/pv.mp4",
  );
  assert.deepEqual(
    extras({
      tags: "bad",
      source: "Steam",
      steamAppId: "../123",
      visitedAt: "bad",
    }),
    {
      tags: [],
      videoUrl: null,
      visitedAt: null,
      source: "local",
      steamAppId: null,
    },
  );
});

test("Windows path deduplication handles case, separators and trailing slashes", () => {
  assert.equal(
    normalizedPath(" D:/Games/ATRI/ "),
    normalizedPath("d:\\games\\atri"),
  );
  assert.equal(installFolder("D:\\Games\\ATRI\\Game.exe"), "D:\\Games\\ATRI");
  assert.equal(installFolder("Game.exe"), ".");
  assert.equal(isGameExecutable("D:\\Games\\ATRI\\Game.exe"), true);
  for (const file of ["unins000.exe", "setup.exe", "config.exe", "readme.txt"])
    assert.equal(isGameExecutable(file), false);
});

test("notice is first-run only and links use the final project identity", () => {
  assert.equal(noticeNeeded(null), true);
  assert.equal(noticeNeeded(NOTICE_VERSION), false);
  assert.equal(noticeNeeded({}), true);
  assert.equal(
    NOTICE_TEXT,
    "本启动器完全开源免费，请使用时务必将游戏名称填入正确的名称，以便于自动导入",
  );
  assert.equal(PROJECT_NAME, "loveyong-starrygal");
  assert.equal(
    REPOSITORY_URL,
    "https://github.com/loveyong07/loveyong-starrygal",
  );
});
