import { test } from "node:test";
import assert from "node:assert/strict";
import { createTouchGalClient } from "../src/features/galgame/touchgal.ts";
import {
  normalizeGameTitle,
  sameGameTitle,
  titleSearchKeywords,
} from "../src/features/galgame/title-matching.ts";

const endpoint = "https://loveyong07.top/api/starrygal";
const envelope = (data) => ({ success: true, data });
const games = [
  { uniqueId: "abcd0001", name: "常轨脱离Creative" },
  { uniqueId: "abcd0002", name: "金辉恋曲四重奏 -Golden Time-" },
  { uniqueId: "abcd0003", name: "恋爱？我就借走了哦！" },
];

test("case-sensitive upstream finds the user's title variants through meaningful fragments", async () => {
  for (const [query, expected] of [
    ["常轨脱离creative", games[0]],
    ["常轨脱离ＣＲＥＡＴＩＶＥ", games[0]],
    ["金辉恋曲四重奏-GoldenTime", games[1]],
    ["金辉恋曲四重奏 -Golden Time", games[1]],
    ["恋爱？我就借走了！", games[2]],
  ]) {
    const requests = [];
    const client = createTouchGalClient(endpoint, false, async (request) => {
      requests.push(request);
      if (request.action === "search")
        return envelope({
          items: games.filter((game) => game.name.includes(request.keyword)),
          pagination: { hasMore: false },
        });
      return envelope(games.find((game) => game.uniqueId === request.uniqueId));
    });
    const result = await client.provider.searchByName(
      query,
      new AbortController().signal,
    );
    assert.equal(result?.touchgalId, expected.uniqueId, query);
    assert.equal(requests[0].keyword, query);
    assert.ok(
      requests.filter((request) => request.action === "search").length <= 5,
    );
  }
});

test("normalization does not confuse sequels, subtitles, short names or arbitrary missing characters", () => {
  assert.equal(
    normalizeGameTitle("ＡＴＲＩ -My Dear Moments-"),
    "atrimydearmoments",
  );
  assert.equal(
    sameGameTitle("恋爱？我就借走了！", "恋爱？我就借走了哦！"),
    true,
  );
  for (const [left, right] of [
    ["金辉恋曲四重奏2", "金辉恋曲四重奏"],
    ["Summer Pockets", "Summer Pockets Reflection Blue"],
    ["夏日啊", "夏日"],
    ["恋爱我就借了哦", "恋爱我就借走了哦"],
    ["---", "!!!"],
  ])
    assert.equal(sameGameTitle(left, right), false, `${left} / ${right}`);
});

test("partial keywords search all titles and leave candidate selection to the user", async () => {
  const catalog = [
    ...games,
    { uniqueId: "abcd0004", name: "Summer Pockets" },
    { uniqueId: "abcd0005", name: "Summer Pockets Reflection Blue" },
    { uniqueId: "abcd0006", name: "サクラノ詩" },
  ];
  const detailCalls = [];
  const client = createTouchGalClient(endpoint, false, async (request) => {
    if (request.action === "search")
      return envelope({
        items: catalog.filter((game) => game.name.includes(request.keyword)),
        pagination: { hasMore: false },
      });
    detailCalls.push(request.uniqueId);
    return envelope(catalog.find((game) => game.uniqueId === request.uniqueId));
  });
  const signal = new AbortController().signal;
  for (const [keyword, expected] of [
    ["常轨脱离", [catalog[0]]],
    ["金辉恋", [catalog[1]]],
    ["Summer", [catalog[3], catalog[4]]],
    ["サクラ", [catalog[5]]],
  ]) {
    assert.deepEqual((await client.search(keyword, signal)).items, expected);
  }
  assert.deepEqual(
    detailCalls,
    [],
    "Searching must not choose or fetch a candidate automatically",
  );
  assert.equal(
    (await client.detail("abcd0005", signal)).title,
    catalog[4].name,
  );
  assert.deepEqual(detailCalls, ["abcd0005"]);
  assert.equal(await client.provider.searchByName("常轨脱离", signal), null);
  await assert.rejects(() => client.search("常轨", signal), /3～100/);
});

test("ambiguous normalized titles and incomplete results remain manual choices", async () => {
  for (const [items, hasMore] of [
    [[games[0], { uniqueId: "abcd1111", name: "常轨脱离creative" }], false],
    [[games[0]], true],
  ]) {
    let details = 0;
    const client = createTouchGalClient(endpoint, false, async (request) => {
      if (request.action === "detail") details++;
      return envelope({ items, pagination: { hasMore } });
    });
    assert.equal(
      await client.provider.searchByName(
        "常轨脱离creative",
        new AbortController().signal,
      ),
      null,
    );
    assert.equal(details, 0);
  }
});

test("manual search exposes its resolved keyword so following pages keep the same query", async () => {
  const requests = [];
  const client = createTouchGalClient(endpoint, false, async (request) => {
    requests.push(request);
    return envelope({
      items: request.keyword === "常轨脱离" ? [games[0]] : [],
      pagination: {
        hasMore: request.keyword === "常轨脱离" && request.page === 1,
      },
    });
  });
  const signal = new AbortController().signal;
  const first = await client.search("常轨脱离creative", signal);
  assert.equal(first.keyword, "常轨脱离");
  assert.equal(first.hasMore, true);
  await client.search(first.keyword, signal, 2);
  assert.equal(requests.at(-1).keyword, "常轨脱离");
  assert.equal(requests.at(-1).page, 2);
});

test("fallback queries honor cancellation and validate the original length", async () => {
  const controller = new AbortController();
  let calls = 0;
  const client = createTouchGalClient(endpoint, false, async () => {
    calls++;
    controller.abort();
    return envelope({ items: [] });
  });
  await assert.rejects(
    () => client.provider.searchByName("常轨脱离creative", controller.signal),
    { name: "AbortError" },
  );
  assert.equal(calls, 1);
  await assert.rejects(
    () =>
      client.provider.searchByName(
        "游戏名".repeat(40),
        new AbortController().signal,
      ),
    /3～100/,
  );
  assert.equal(calls, 1);
  assert.deepEqual(titleSearchKeywords("常轨脱离creative").slice(0, 2), [
    "常轨脱离creative",
    "常轨脱离",
  ]);
});
