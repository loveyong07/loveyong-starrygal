import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTouchGalIntroduction } from "../src/features/galgame/touchgal-introduction.ts";
import {
  parseTouchGalDetail,
  metadataPatch,
} from "../src/features/galgame/touchgal.ts";
import { extras } from "../src/features/galgame/model.ts";

test("TouchGal Markdown images and kun-video directives become real media, not prose", () => {
  const result = parseTouchGalIntroduction(
    '## 游戏介绍\n\n夏日的故事。\n\n## 游戏截图\n\n![](https://cloud.touchgaloss.com/scene.avif)\n\n![](https://cloud.touchgaloss.com/scene.avif)\n\n## PV鉴赏\n\n::kun-video{src="https://cloud.touchgaloss.com/pv.mp4"}\n\n## 支持正版\n\n::kun-link{href="https://example.com/game" text="访问官网"}',
  );
  assert.deepEqual(result.screenshots, [
    "https://cloud.touchgaloss.com/scene.avif",
  ]);
  assert.equal(result.videoUrl, "https://cloud.touchgaloss.com/pv.mp4");
  assert.match(result.description, /夏日的故事/);
  assert.match(result.description, /访问官网/);
  for (const raw of ["::kun-", "![]", "##", "游戏截图", "PV鉴赏"])
    assert.equal(result.description.includes(raw), false);
});

test("HTML media and signed URLs are supported without scripts or active content", () => {
  const result = parseTouchGalIntroduction(
    '<p>故事</p><script>doNotExecute()</script><img src="https://example.com/scene.webp"><video><source src="https://example.com/pv.mp4?x=1&amp;y=2"></video>',
  );
  assert.deepEqual(result.screenshots, ["https://example.com/scene.webp"]);
  assert.equal(result.videoUrl, "https://example.com/pv.mp4?x=1&y=2");
  assert.equal(result.description, "故事");
  const bad = parseTouchGalIntroduction(
    '![](javascript:alert)\n![](https://user:secret@example.com/scene.jpg)\n::kun-video{src="javascript:alert"}',
  );
  assert.equal(bad.videoUrl, null);
  assert.deepEqual(bad.screenshots, []);
});

test("Windows line endings and empty media headings cannot leave a large blank section", () => {
  const result = parseTouchGalIntroduction(
    '## 游戏介绍\r\n\r\n故事正文\r\n\r\n## 游戏截图\r\n\r\n![](https://example.com/a.avif)\r\n\r\n## PV鉴赏\r\n\r\n::kun-video{src="https://example.com/pv.mp4"}\r\n\r\n## 支持正版\r\n\r\n::kun-link{href="http://key.visualarts.gr.jp/summer/" text="前往官网"}',
  );
  assert.equal(result.description.includes("\r"), false);
  assert.equal(/\n{3}/.test(result.description), false);
  assert.match(
    result.description,
    /http:\/\/key\.visualarts\.gr\.jp\/summer\//,
  );
});

test("media reaches imported game extras and preserves manual PV overrides", () => {
  const result = parseTouchGalDetail({
    uniqueId: "abcd1234",
    name: "作品名称",
    introduction:
      '一段简介\n![](https://example.com/scene.avif)\n::kun-video{src="https://example.com/pv.mp4"}',
  });
  const game = {
    ...extras({}),
    title: "作品名称",
    coverPath: null,
    description: null,
  };
  const patch = metadataPatch(game, result);
  assert.equal(patch.videoUrl, "https://example.com/pv.mp4");
  assert.deepEqual(patch.screenshots, ["https://example.com/scene.avif"]);
  assert.equal(patch.description, "一段简介");
  assert.equal(
    "videoUrl" in metadataPatch({ ...game, videoOverride: true }, result),
    false,
  );
  assert.equal(
    "videoUrl" in
      metadataPatch(
        { ...game, videoUrl: "https://example.com/manual.mp4" },
        result,
      ),
    false,
  );
  assert.deepEqual(extras({ ...game, ...patch }).screenshots, [
    "https://example.com/scene.avif",
  ]);
});
