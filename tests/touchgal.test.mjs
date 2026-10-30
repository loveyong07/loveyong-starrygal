import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createTouchGalClient,
  metadataPatch,
  parseTouchGalDetail,
  touchgalLink,
  unwrapTouchGal,
  validateEndpoint,
} from "../src/features/galgame/touchgal.ts";
import { extras } from "../src/features/galgame/model.ts";

const endpoint = "https://loveyong07.top/api/starrygal";
const envelope = (data) => ({ success: true, data });
const detail = {
  uniqueId: "abcd1234",
  name: "Summer Pockets",
  aliases: ["サマーポケッツ"],
  introduction:
    "<p>夏日故事</p><script>hidden()</script><p>新的回忆 &amp; 朋友</p>",
  bannerUrl: "https://img.example.com/cover.webp",
  tags: ["夏日", "夏日", "恋爱"],
  companies: [{ name: "Key" }],
  releaseDate: "2018-06-29",
  rating: { average: 8.7, count: 128 },
  touchgalUrl: "https://www.touchgal.ink/abcd1234",
};

test("official detail fields map without fabricating a PV or a personal rating", () => {
  const data = parseTouchGalDetail(detail);
  assert.equal(data.coverUrl, detail.bannerUrl);
  assert.equal(data.originalTitle, "サマーポケッツ");
  assert.equal(data.developer, "Key");
  assert.equal(data.communityRating, 8.7);
  assert.equal(data.communityRatingCount, 128);
  assert.equal("rating" in data, false);
  assert.equal(data.videoUrl, null);
  assert.equal(data.description, "夏日故事\n\n新的回忆 & 朋友");
  assert.deepEqual(data.tags, ["夏日", "恋爱"]);
});

test("automatic matching requires an unambiguous exact title or alias", async () => {
  const requests = [];
  const client = createTouchGalClient(endpoint, true, async (request) => {
    requests.push(request);
    return request.action === "search"
      ? envelope({
          items: [{ name: detail.name, uniqueId: detail.uniqueId }],
          pagination: { hasMore: false },
        })
      : envelope(detail);
  });
  const signal = new AbortController().signal;
  assert.equal(
    (await client.provider.searchByName("Summer Pockets", signal)).touchgalId,
    "abcd1234",
  );
  assert.equal(requests[0].keyword, "Summer Pockets");
  assert.equal(requests[0].allowNsfw, true);
  assert.equal(
    (await client.provider.searchByName("サマーポケッツ", signal)).sourceTitle,
    "Summer Pockets",
  );
  assert.equal(await client.provider.searchByName("Summer", signal), null);
  const ambiguous = createTouchGalClient(endpoint, false, async () =>
    envelope({
      items: [
        { name: "Summer Pockets", uniqueId: "abcd1234" },
        { name: "Summer Pockets", uniqueId: "abcd5678" },
      ],
    }),
  );
  assert.equal(
    await ambiguous.provider.searchByName("Summer Pockets", signal),
    null,
  );
  await assert.rejects(() => client.search("夏日", signal), /3～100/);
});

test("late responses after cancellation never apply metadata", async () => {
  const controller = new AbortController();
  let calls = 0;
  const client = createTouchGalClient(endpoint, false, async () => {
    calls++;
    controller.abort();
    return envelope({
      items: [{ name: detail.name, uniqueId: detail.uniqueId }],
    });
  });
  await assert.rejects(
    () => client.provider.searchByName(detail.name, controller.signal),
    { name: "AbortError" },
  );
  assert.equal(calls, 1);
  await assert.rejects(() => client.search(detail.name, controller.signal), {
    name: "AbortError",
  });
  assert.equal(calls, 1);
});

test("metadata merge preserves user data, tags, custom covers and reviews", () => {
  const game = {
    ...extras({}),
    title: "我填写的正确名称",
    originalTitle: "自填原名",
    coverPath: "D:/covers/saved.webp",
    description: "自填简介",
    developer: "自填会社",
    releaseDate: "2020-01-01",
    tags: ["我的标签"],
    videoUrl: "https://video.example.com/pv.mp4",
    customCoverPath: "D:/covers/custom.png",
    rating: 9.5,
    notes: "我的评价",
    status: "completed",
  };
  const data = parseTouchGalDetail(detail);
  const merged = { ...game, ...metadataPatch(game, data) };
  for (const key of [
    "title",
    "originalTitle",
    "coverPath",
    "description",
    "developer",
    "releaseDate",
    "videoUrl",
    "customCoverPath",
    "rating",
    "notes",
    "status",
  ])
    assert.equal(merged[key], game[key], key);
  assert.deepEqual(merged.tags, ["我的标签", "夏日", "恋爱"]);
  assert.equal(merged.communityRating, 8.7);
  const replaced = { ...game, ...metadataPatch(game, data, true) };
  assert.equal(replaced.description, data.description);
  assert.equal(replaced.coverPath, data.coverUrl);
  for (const key of [
    "title",
    "videoUrl",
    "customCoverPath",
    "rating",
    "notes",
    "status",
  ])
    assert.equal(replaced[key], game[key], key);
});

test("relay and external link validation reject injected destinations", async () => {
  for (const url of [
    "http://example.com",
    "javascript:alert(1)",
    "https://user:secret@example.com",
    "https://example.com?token=secret",
  ])
    assert.throws(() => validateEndpoint(url));
  assert.equal(
    touchgalLink("https://touchgal.ink.evil.example/abcd1234"),
    null,
  );
  assert.equal(
    touchgalLink("https://touchgal.ink@evil.example/abcd1234"),
    null,
  );
  assert.throws(
    () =>
      unwrapTouchGal({
        success: false,
        error: { code: "RATE_LIMITED", message: "private error detail" },
      }),
    /额度/,
  );
  const client = createTouchGalClient(endpoint, false, async () =>
    envelope({
      items: [
        {
          name: "资源",
          deepLink: "https://www.touchgal.ink/abcd1234?tab=resources",
          sizes: ["4GB"],
        },
        { name: "无效资源", deepLink: "javascript:alert(1)" },
      ],
    }),
  );
  const items = await client.resources(
    "abcd1234",
    "resources",
    new AbortController().signal,
  );
  assert.equal(items.length, 1);
  assert.equal(items[0].name, "资源");
});
