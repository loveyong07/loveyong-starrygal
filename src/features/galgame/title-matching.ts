/** Shared by library filtering and TouchGal matching; never changes saved names. */
export function normalizeGameTitle(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
}

export function sameGameTitle(left: string, right: string): boolean {
  const a = normalizeGameTitle(left);
  const b = normalizeGameTitle(right);
  if (!a || !b) return false;
  if (a === b) return true;
  // A missing final interjection is common in Chinese titles. Do not relax
  // numbers, sequel names, subtitles, or arbitrary spelling differences.
  const withoutInterjection = (name: string) =>
    name.replace(/[哦喔啊呀哟呦]$/u, "");
  return (
    Math.min([...a].length, [...b].length) >= 6 &&
    withoutInterjection(a) === withoutInterjection(b)
  );
}

/** Upstream search can be case/punctuation sensitive. Retry meaningful title
 * fragments instead of sending only a compacted name the server cannot find. */
export function titleSearchKeywords(value: string): string[] {
  const raw = value.trim();
  const normalized = raw.normalize("NFKC");
  const chinese = [...normalized.matchAll(/\p{Script=Han}+/gu)]
    .map(([part]) => part)
    .filter((part) => [...part].length >= 3)
    .sort((a, b) => [...b].length - [...a].length);
  const words = normalized.match(/[\p{L}\p{N}]+/gu) || [];
  const latin = words.filter((word) => /^[a-z]{3,}$/i.test(word));
  const variants = [
    raw,
    normalized,
    ...chinese,
    ...words.filter((word) => [...word].length >= 3),
    ...latin.flatMap((word) => [
      word[0].toUpperCase() + word.slice(1).toLowerCase(),
      word.toLowerCase(),
      word.toUpperCase(),
    ]),
  ];
  return [...new Set(variants)]
    .filter((word) => {
      const length = [...word].length;
      return length >= 3 && length <= 100;
    })
    .slice(0, 5);
}
