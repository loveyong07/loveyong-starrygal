import { test } from "node:test";
import assert from "node:assert/strict";
import {
  lookupGameByName,
  metadataConfigured,
  registerMetadataProvider,
} from "../src/features/galgame/metadata.ts";

test("no API adapter means no request and no fabricated metadata", async () => {
  registerMetadataProvider(null);
  assert.equal(metadataConfigured(), false);
  assert.equal(
    await lookupGameByName("真实游戏名", new AbortController().signal),
    null,
  );
});

test("adapter queries the corrected title and validates returned media", async () => {
  const calls = [];
  registerMetadataProvider({
    searchByName: async (name, signal) => {
      calls.push({ name, signal });
      return {
        description: "返回的真实简介",
        tags: [" 科幻 ", "科幻", "恋爱"],
        coverUrl: "https://example.com/cover.webp",
        videoUrl: "javascript:alert(1)",
      };
    },
  });
  try {
    const controller = new AbortController();
    const result = await lookupGameByName(
      "  已修正的游戏名  ",
      controller.signal,
    );
    assert.equal(calls[0].name, "已修正的游戏名");
    assert.equal(calls[0].signal, controller.signal);
    assert.equal(result.description, "返回的真实简介");
    assert.deepEqual(result.tags, ["科幻", "恋爱"]);
    assert.equal(result.coverUrl, "https://example.com/cover.webp");
    assert.equal(result.videoUrl, null);
    controller.abort();
    assert.equal(await lookupGameByName("另一部游戏", controller.signal), null);
    assert.equal(calls.length, 1);
  } finally {
    registerMetadataProvider(null);
  }
});
