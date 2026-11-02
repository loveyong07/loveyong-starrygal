import { test } from "node:test";
import assert from "node:assert/strict";
import { createCachedTouchGalTransport } from "../src/features/galgame/touchgal-cache.ts";
import {
  createTouchGalClient,
  unwrapTouchGal,
} from "../src/features/galgame/touchgal.ts";

const endpoint = "https://loveyong07.top/api/starrygal";
const signal = () => new AbortController().signal;
const success = (data) => ({ success: true, data });
const row = { name: "Summer Pockets", uniqueId: "abcd1234" };
const details = {
  ...row,
  introduction: "Saved story",
  aliases: ["サマーポケッツ"],
};
const search = (items = [row]) =>
  success({ items, pagination: { hasMore: false } });
const request = (patch = {}) => ({
  endpoint,
  action: "search",
  keyword: row.name,
  page: 1,
  allowNsfw: false,
  ...patch,
});
function store() {
  const records = new Map();
  return {
    records,
    getItem: (key) => records.get(key) ?? null,
    setItem: (key, value) => records.set(key, value),
  };
}

test("imports, previews, reopened details and a recreated client share durable responses", async () => {
  const saved = store();
  const requests = [];
  const fetch = async (req) => {
    requests.push(req);
    return req.action === "search" ? search() : success(details);
  };
  const client = () =>
    createTouchGalClient(
      endpoint,
      false,
      createCachedTouchGalTransport(fetch, saved),
    );
  assert.equal(
    (await client().provider.searchByName(row.name, signal())).touchgalId,
    row.uniqueId,
  );
  assert.equal(requests.length, 2);
  await client().search(row.name, signal());
  await client().detail(row.uniqueId, signal());
  await client().provider.searchByName(row.name, signal());
  assert.equal(
    requests.length,
    2,
    "recreated clients must not repeat spent requests",
  );
  await client().detail(row.uniqueId, signal(), true);
  assert.equal(requests.length, 3);
  assert.equal(requests.at(-1).forceRefresh, true);
  await client().detail(row.uniqueId, signal());
  assert.equal(requests.length, 3);
  await client().search(row.name, signal(), 1, true);
  assert.equal(requests.length, 4);
  assert.equal(requests.at(-1).action, "search");
  assert.equal(requests.at(-1).forceRefresh, true);
});

test("empty successful searches survive relaunch; explicit refresh can discover new entries", async () => {
  const saved = store();
  let calls = 0;
  const fetch = async () => {
    calls++;
    return calls === 1 ? search([]) : search();
  };
  const first = createCachedTouchGalTransport(fetch, saved);
  assert.deepEqual(await first(request(), signal()), search([]));
  const reopened = createCachedTouchGalTransport(fetch, saved);
  assert.deepEqual(await reopened(request(), signal()), search([]));
  assert.equal(calls, 1);
  assert.deepEqual(
    await reopened(request({ forceRefresh: true }), signal()),
    search(),
  );
  assert.equal(calls, 2);
});

test("new titles, pages, services and rating filters remain separate; tokens are absent from files", async () => {
  const saved = store();
  let calls = 0;
  const cached = createCachedTouchGalTransport(async () => {
    calls++;
    return search();
  }, saved);
  await cached(request({ apiToken: "private_test_token" }), signal());
  await cached(request({ apiToken: "another_test_token" }), signal());
  assert.equal(calls, 1);
  for (const patch of [
    { keyword: "Another game" },
    { page: 2 },
    { endpoint: "https://other.example/api" },
    { allowNsfw: true },
  ])
    await cached(request(patch), signal());
  assert.equal(calls, 5);
  const serialized = JSON.stringify([...saved.records]);
  assert.equal(
    /private_test_token|another_test_token|apiToken|Authorization/.test(
      serialized,
    ),
    false,
  );
});

test("concurrent callers spend one request and cancellation does not lose the saved response", async () => {
  const saved = store();
  let calls = 0;
  let finish;
  const cached = createCachedTouchGalTransport(async () => {
    calls++;
    return new Promise((resolve) => {
      finish = resolve;
    });
  }, saved);
  const controller = new AbortController();
  const first = cached(request(), controller.signal);
  const second = cached(request(), signal());
  controller.abort();
  await assert.rejects(first, { name: "AbortError" });
  finish(search());
  assert.deepEqual(await second, search());
  assert.deepEqual(await cached(request(), signal()), search());
  assert.equal(calls, 1);
  const aborted = new AbortController();
  aborted.abort();
  await assert.rejects(cached(request(), aborted.signal), {
    name: "AbortError",
  });
  assert.equal(calls, 1);
});

test("rate limits, network errors and malformed responses are never cached", async () => {
  const saved = store();
  let calls = 0;
  const cached = createCachedTouchGalTransport(async () => {
    calls++;
    if (calls === 1) throw new Error("offline");
    if (calls === 2) return { success: false, error: { code: "RATE_LIMITED" } };
    if (calls === 3)
      return success({ items: [{ name: "broken", uniqueId: "x" }] });
    return search();
  }, saved);
  await assert.rejects(cached(request(), signal()), /offline/);
  const error = await cached(request(), signal());
  assert.throws(() => unwrapTouchGal(error), /额度/);
  await cached(request(), signal());
  assert.equal(saved.records.size, 0);
  await cached(request(), signal());
  assert.equal(calls, 4);
  assert.equal(saved.records.size, 1);
});

test("failed refresh leaves the prior data usable offline and corrupt cache is repaired", async () => {
  const saved = store();
  let offline = false;
  let calls = 0;
  const cached = createCachedTouchGalTransport(async () => {
    calls++;
    if (offline) throw new Error("offline");
    return search();
  }, saved);
  await cached(request(), signal());
  offline = true;
  await assert.rejects(
    cached(request({ forceRefresh: true }), signal()),
    /offline/,
  );
  assert.deepEqual(await cached(request(), signal()), search());
  assert.equal(calls, 2);
  saved.records.set([...saved.records.keys()][0], "{truncated");
  offline = false;
  await cached(request(), signal());
  assert.equal(calls, 3);
});

test("status and connection tests always request live data; storage failures are visible", async () => {
  const saved = store();
  let calls = 0;
  const cached = createCachedTouchGalTransport(async () => {
    calls++;
    return success({ ready: true });
  }, saved);
  await cached(request({ action: "status" }), signal());
  await cached(request({ action: "status" }), signal());
  assert.equal(calls, 2);
  assert.equal(saved.records.size, 0);
  const full = createCachedTouchGalTransport(async () => search(), {
    getItem: () => null,
    setItem: () => {
      throw new Error("QuotaExceededError");
    },
  });
  await assert.rejects(full(request(), signal()), /本地缓存保存失败/);
});
