import { test } from "node:test";
import assert from "node:assert/strict";
import { createHandler, parseRequest, publicData } from "../api/starrygal.js";

function response() {
  return {
    headers: {},
    statusCode: 0,
    body: null,
    setHeader(key, value) {
      this.headers[key] = value;
    },
    status(value) {
      this.statusCode = value;
      return this;
    },
    json(value) {
      this.body = value;
    },
    end() {},
  };
}
const req = (url, address = "relay-test") => ({
  method: "GET",
  url,
  headers: { "x-forwarded-for": address },
});

test("relay only builds documented fixed-origin routes with validated parameters", () => {
  const parsed = parseRequest(
    "/api/starrygal?action=search&keyword=Summer%20Pockets&allowNsfw=true&page=2",
  );
  assert.equal(parsed.upstream.origin, "https://developer.touchgal.com");
  assert.equal(parsed.upstream.pathname, "/api/v1/games/search");
  assert.equal(parsed.upstream.searchParams.get("keyword"), "Summer Pockets");
  assert.equal(parsed.upstream.searchParams.get("allowNsfw"), "true");
  assert.equal(
    parseRequest("/api/starrygal?action=patches&uniqueId=abcd1234").upstream
      .pathname,
    "/api/v1/games/abcd1234/patches",
  );
  for (const query of [
    "action=search&keyword=xy",
    "action=detail&uniqueId=../games",
    "action=me",
    "url=https://evil.example",
    "action=status&action=detail",
    "allowNsfw=1",
    "action=search&keyword=Summer&page=101",
  ])
    assert.throws(() => parseRequest("/api/starrygal?" + query));
});

test("public status strips token and account identifiers and caches successful requests", async () => {
  let calls = 0;
  const secret = "test-token-status";
  const handler = createHandler({
    token: () => secret,
    fetchImpl: async (url, options) => {
      calls++;
      assert.equal(url.pathname, "/api/v1/me");
      assert.equal(options.headers.Authorization, "Bearer " + secret);
      assert.equal(options.redirect, "error");
      return Response.json({
        success: true,
        data: {
          tokenPrefix: "private-prefix",
          applicationId: "private-id",
          minuteLimit: 60,
          dailyLimit: 5000,
        },
      });
    },
  });
  for (let i = 0; i < 2; i++) {
    const res = response();
    await handler(req("/api/starrygal?action=status"), res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.data.ready, true);
    assert.equal(res.body.data.dailyLimit, 5000);
    assert.match(res.headers["Cache-Control"], /s-maxage=300/);
    for (const value of [secret, "private-prefix", "private-id"])
      assert.equal(JSON.stringify(res).includes(value), false);
  }
  assert.equal(calls, 1);
});

test("missing tokens, upstream errors and rate limits never expose credentials or get cached", async () => {
  const missing = response();
  await createHandler({ token: () => "" })(req("/api/starrygal"), missing);
  assert.equal(missing.statusCode, 503);
  assert.equal(missing.body.error.code, "NOT_CONFIGURED");
  let calls = 0;
  const handler = createHandler({
    token: () => "test-token-error",
    fetchImpl: async () => {
      calls++;
      return new Response("private diagnostic", { status: 429 });
    },
  });
  for (let i = 0; i < 2; i++) {
    const res = response();
    await handler(req("/api/starrygal?action=status", "error-test"), res);
    assert.equal(res.statusCode, 429);
    assert.equal(res.body.error.code, "RATE_LIMITED");
    assert.equal(res.headers["Cache-Control"], "no-store");
    assert.equal(res.headers["Retry-After"], "60");
    assert.equal(JSON.stringify(res).includes("private diagnostic"), false);
  }
  assert.equal(calls, 2);
});

test("resource fields and URLs are whitelisted before leaving the server", () => {
  const data = publicData("resources", {
    items: [
      {
        name: "资源",
        deepLink: "https://www.touchgal.ink/abcd1234?tab=resources",
        downloadUrl: "https://private.example/file",
        password: "private",
        uploader: "private",
      },
      { deepLink: "https://evil.example" },
    ],
  });
  assert.equal(data.items.length, 1);
  assert.equal("downloadUrl" in data.items[0], false);
  assert.equal(JSON.stringify(data).includes("private"), false);
});

test("in-flight requests are deduplicated and each warm instance bounds repeated clients", async () => {
  let calls = 0;
  const handler = createHandler({
    token: () => "test-token-dedupe",
    fetchImpl: async () => {
      calls++;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return Response.json({ success: true, data: { minuteLimit: 60 } });
    },
  });
  const first = response(),
    second = response();
  await Promise.all([
    handler(req("/api/starrygal", "dedupe-test"), first),
    handler(req("/api/starrygal", "dedupe-test"), second),
  ]);
  assert.equal(calls, 1);
  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 200);
  for (let i = 0; i < 29; i++)
    await handler(req("/api/starrygal", "dedupe-test"), second);
  assert.equal(second.statusCode, 429);
});
