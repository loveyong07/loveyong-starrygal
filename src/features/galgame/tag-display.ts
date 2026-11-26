import rawTranslations from "../../lib/tag-translations.json" with { type: "json" };

export interface DisplayTag {
  key: string;
  label: string;
  raw: string;
  kind: "meta" | "story";
}

const EXTRA_TRANSLATIONS: Record<string, string> = {
  gal: "视觉小说",
  galgame: "视觉小说",
  "visual novel": "视觉小说",
  "kinetic novel": "单线视觉小说",
  avg: "冒险",
  "all ages": "全年龄",
  steam: "Steam",
  pc: "PC",
};

const TRANSLATION_MAP = (() => {
  const map = new Map<string, string>();
  for (const [key, value] of Object.entries(
    rawTranslations as Record<string, string>,
  )) {
    const normalized = key.trim().toLocaleLowerCase();
    const translated = value.trim();
    if (normalized && translated) map.set(normalized, translated);
  }
  for (const [key, value] of Object.entries(EXTRA_TRANSLATIONS)) {
    map.set(key.trim().toLocaleLowerCase(), value);
  }
  return map;
})();

const META_TAG_PATTERN =
  /^(?:(?:19|20)\d{2}s?|\d{4}年代|pc|steam|windows|mac|linux|switch|ps[45v]|android|ios|krkr|ren'?py|siglus.*|bgi.*|advhd.*|.*\.exe|全年龄)$/i;

/**
 * Translate known tags for read-only display while preserving original values
 * in storage, deduplicating equivalent forms and distinguishing platform/year tags.
 */
export function formatStoryTags(tags: readonly string[]): DisplayTag[] {
  const seen = new Set<string>();
  const out: DisplayTag[] = [];
  for (const item of tags) {
    const raw = typeof item === "string" ? item.trim() : "";
    if (!raw) continue;
    const translated = TRANSLATION_MAP.get(raw.toLocaleLowerCase()) || raw;
    const dedupeKey = translated.toLocaleLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    const kind: DisplayTag["kind"] =
      META_TAG_PATTERN.test(raw) || META_TAG_PATTERN.test(translated)
        ? "meta"
        : "story";
    out.push({
      key: raw,
      label: translated,
      raw,
      kind,
    });
  }
  return out;
}
