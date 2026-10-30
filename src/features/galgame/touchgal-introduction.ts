import { mediaUrl } from "./model.ts";

function safeMedia(value: string): string | null {
  const safe = mediaUrl(value.replace(/&amp;/g, "&"));
  if (!safe) return null;
  const url = new URL(safe);
  return url.protocol === "https:" && !url.username && !url.password
    ? url.href
    : null;
}

/** Parse public introduction markup as data; never execute upstream HTML or components. */
export function parseTouchGalIntroduction(value: string | null | undefined) {
  let text =
    typeof value === "string"
      ? value.slice(0, 200000).replace(/\r\n?/g, "\n")
      : "";
  const screenshots: string[] = [];
  let videoUrl: string | null = null;
  const addVideo = (value: string) => {
    const url = safeMedia(value);
    if (
      url &&
      !videoUrl &&
      (/\.(mp4|webm|ogv|m4v)(?:[?#]|$)/i.test(url) ||
        /(^|\.)(bilibili\.com|b23\.tv|youtube\.com|youtu\.be|vimeo\.com)$/.test(
          new URL(url).hostname,
        ))
    )
      videoUrl = url;
  };
  const addImage = (value: string) => {
    const url = safeMedia(value);
    if (!url) return;
    if (/\.(mp4|webm|ogv|m4v)(?:[?#]|$)/i.test(url)) {
      addVideo(url);
      return;
    }
    if (screenshots.length < 12 && !screenshots.includes(url))
      screenshots.push(url);
  };
  text = text.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "");
  text = text.replace(/::kun-video\s*\{([^}]*)\}/gi, (_all, attrs: string) => {
    const source = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(attrs);
    if (source) addVideo(source[1]);
    return "";
  });
  text = text.replace(
    /<(?:video|source)\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi,
    (_all, source: string) => {
      addVideo(source);
      return "";
    },
  );
  text = text.replace(
    /<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi,
    (_all, source: string) => {
      addImage(source);
      return "";
    },
  );
  text = text.replace(
    /!\[[^\]]*\]\(\s*(?:<([^>]+)>|([^\s)]+))(?:\s+["'][^"']*["'])?\s*\)/g,
    (_all, angle: string, source: string) => {
      addImage(angle || source);
      return "";
    },
  );
  text = text.replace(/::kun-link\s*\{([^}]*)\}/gi, (_all, attrs: string) => {
    const label =
      /\btext\s*=\s*["']([^"']*)["']/i.exec(attrs)?.[1] || "相关链接";
    const href = /\bhref\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1];
    const url = href ? mediaUrl(href) : null;
    return url && !new URL(url).username && !new URL(url).password
      ? `${label}（${url}）`
      : label;
  });
  text = text.replace(/::[a-z][\w-]*\s*\{[^}]*\}/gi, "");
  text = text.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    (_all, label: string, href: string) => {
      if (/\.(mp4|webm|ogv|m4v)(?:[?#]|$)/i.test(href)) {
        addVideo(href);
        return "";
      }
      const url = mediaUrl(href);
      return url && !new URL(url).username && !new URL(url).password
        ? `${label}（${url}）`
        : label;
    },
  );
  text = text
    .replace(/<\/?(?:p|div|br|li|h[1-6])\b[^>]*>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/^>\s?/gm, "");
  const lines = text.split("\n");
  let following = "";
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (/^#{1,6}\s/.test(line)) {
      if (!following || /^#{1,6}\s/.test(following)) lines[i] = "";
      following = line;
    } else if (line) following = line;
  }
  return {
    description:
      lines
        .map((line) => line.trimEnd())
        .join("\n")
        .replace(/^#{1,6}\s+/gm, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim() || null,
    screenshots,
    videoUrl,
  };
}
