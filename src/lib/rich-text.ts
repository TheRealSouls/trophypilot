/**
 * Formatting for everything members write (forum posts, guides, tips,
 * comments, messages): a small Discord-style markdown.
 *
 *   **bold**  *italic* or _italic_  __underline__  ~~strikethrough~~
 *   ||spoiler||  `code`  [text](https://link)  https://bare-links
 *   # Huge   ## Large   ### Medium   -# small text
 *   > quote   - bullet   1. numbered
 *   A YouTube link on a line of its own becomes an embedded video, and an
 *   image link (or ![description](https://…)) on its own line shows the picture.
 *   ->centred text<-
 *
 * Parsed into plain data here and rendered by components/RichText.tsx. Raw
 * HTML is never interpreted, so there is nothing to sanitise.
 */

export type Inline =
  | { t: "text"; v: string }
  | { t: "code"; v: string }
  | { t: "link"; href: string; c: Inline[] }
  | { t: "b" | "i" | "u" | "s" | "spoiler"; c: Inline[] };

export type Block =
  | { t: "p"; lines: Inline[][] }
  | { t: "h"; level: 1 | 2 | 3; c: Inline[] }
  | { t: "small"; c: Inline[] }
  | { t: "quote"; lines: Inline[][] }
  | { t: "ul" | "ol"; items: Inline[][] }
  | { t: "video"; id: string }
  | { t: "image"; src: string; alt: string }
  | { t: "center"; c: Inline[] }
  | { t: "pre"; v: string };

const YOUTUBE =
  /^(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})(?:[?&#][^\s]*)?$/;

const IMAGE_URL = /^https:\/\/[^\s<>"]+\.(?:png|jpe?g|gif|webp|avif)(?:\?[^\s<>"]*)?$/i;
const IMAGE_MD = /^!\[([^\]\n]{0,200})\]\((https:\/\/[^\s)<>"]{1,1000})\)$/;

/** A picture when the whole line is an https image link or ![description](https://…). */
export function imageLine(s: string): { src: string; alt: string } | null {
  const line = s.trim();
  const md = IMAGE_MD.exec(line);
  if (md) return { src: md[2], alt: md[1] };
  return IMAGE_URL.test(line) ? { src: line, alt: "" } : null;
}

/** The video id when the whole string is a YouTube link. */
export function youtubeId(s: string) {
  return YOUTUBE.exec(s.trim())?.[1] ?? null;
}

export function parseRichText(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let para: Inline[][] = [];
  const flush = () => {
    if (para.length) blocks.push({ t: "p", lines: para });
    para = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\s+$/, "");
    let m: RegExpExecArray | null;

    if (line.startsWith("```")) {
      flush();
      const code: string[] = [];
      for (i++; i < lines.length && !lines[i].trimEnd().startsWith("```"); i++) code.push(lines[i]);
      blocks.push({ t: "pre", v: code.join("\n") });
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    const video = youtubeId(line);
    if (video) {
      flush();
      blocks.push({ t: "video", id: video });
      continue;
    }
    const image = imageLine(line);
    if (image) {
      flush();
      blocks.push({ t: "image", ...image });
      continue;
    }
    if ((m = /^->\s*(.+?)\s*<-$/.exec(line))) {
      flush();
      blocks.push({ t: "center", c: parseInline(m[1]) });
      continue;
    }
    if ((m = /^(#{1,3})\s+(.+)$/.exec(line))) {
      flush();
      blocks.push({ t: "h", level: m[1].length as 1 | 2 | 3, c: parseInline(m[2]) });
      continue;
    }
    if ((m = /^-#\s+(.+)$/.exec(line))) {
      flush();
      blocks.push({ t: "small", c: parseInline(m[1]) });
      continue;
    }
    if (/^>\s?/.test(line)) {
      flush();
      const quote: Inline[][] = [];
      for (; i < lines.length && /^>\s?/.test(lines[i]); i++) quote.push(parseInline(lines[i].replace(/^>\s?/, "")));
      i--;
      blocks.push({ t: "quote", lines: quote });
      continue;
    }
    const bullet = /^\s*[-*•]\s+(.+)$/;
    const numbered = /^\s*\d{1,3}[.)]\s+(.+)$/;
    if (bullet.test(line) || numbered.test(line)) {
      flush();
      const kind = bullet.test(line) ? "ul" : "ol";
      const re = kind === "ul" ? bullet : numbered;
      const items: Inline[][] = [];
      for (; i < lines.length && re.test(lines[i]); i++) items.push(parseInline(re.exec(lines[i])![1]));
      i--;
      blocks.push({ t: kind, items });
      continue;
    }
    para.push(parseInline(line));
  }
  flush();
  return blocks;
}

type Rule = { re: RegExp; make: (m: RegExpExecArray, depth: number) => Inline };

// Order breaks ties when two start at the same place.
const RULES: Rule[] = [
  { re: /`([^`\n]+)`/, make: (m) => ({ t: "code", v: m[1] }) },
  {
    re: /\[([^\]\n]{1,200})\]\((https?:\/\/[^\s)]{1,500})\)/,
    make: (m, d) => ({ t: "link", href: m[2], c: parseInline(m[1], d + 1) }),
  },
  {
    re: /https?:\/\/[^\s<>()]{2,500}[^\s<>().,:;"'!?\]]/,
    make: (m) => ({ t: "link", href: m[0], c: [{ t: "text", v: m[0] }] }),
  },
  { re: /\*\*(?=\S)([\s\S]+?)\*\*/, make: (m, d) => ({ t: "b", c: parseInline(m[1], d + 1) }) },
  { re: /__(?=\S)([\s\S]+?)__/, make: (m, d) => ({ t: "u", c: parseInline(m[1], d + 1) }) },
  { re: /~~(?=\S)([\s\S]+?)~~/, make: (m, d) => ({ t: "s", c: parseInline(m[1], d + 1) }) },
  { re: /\|\|(?=\S)([\s\S]+?)\|\|/, make: (m, d) => ({ t: "spoiler", c: parseInline(m[1], d + 1) }) },
  { re: /(?<![*\w])\*(?=[^\s*])([^*\n]+?)\*(?![*\w])/, make: (m, d) => ({ t: "i", c: parseInline(m[1], d + 1) }) },
  { re: /(?<![_\w])_(?=[^\s_])([^_\n]+?)_(?![_\w])/, make: (m, d) => ({ t: "i", c: parseInline(m[1], d + 1) }) },
];

export function parseInline(src: string, depth = 0): Inline[] {
  if (!src) return [];
  if (depth > 6) return [{ t: "text", v: src }];
  const out: Inline[] = [];
  let rest = src;
  while (rest) {
    let best: { m: RegExpExecArray; rule: Rule } | null = null;
    for (const rule of RULES) {
      const m = rule.re.exec(rest);
      if (m && (!best || m.index < best.m.index)) best = { m, rule };
    }
    if (!best) {
      out.push({ t: "text", v: rest });
      break;
    }
    if (best.m.index > 0) out.push({ t: "text", v: rest.slice(0, best.m.index) });
    out.push(best.rule.make(best.m, depth));
    rest = rest.slice(best.m.index + best.m[0].length);
  }
  return out;
}

/** The words without the formatting marks, for one-line previews (inbox, lists, search). */
export function plainText(src: string) {
  return src
    .replace(/\r\n?/g, "\n")
    .split("\n")
    // Headings, quotes and list marks only count at the start of a line.
    .map((l) => (youtubeId(l) ? "[video]" : imageLine(l) ? "[picture]" : l.replace(/^->\s*(.+?)\s*<-$/, "$1").replace(/^\s*(?:#{1,3}|-#|>|[-*•]|\d{1,3}[.)])\s+/, "")))
    .join(" ")
    .replace(/```/g, "")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, "$1")
    .replace(/\|\|([\s\S]+?)\|\|/g, "(spoiler)")
    .replace(/(\*\*|__|~~|`)/g, "")
    .replace(/(?<![*\w])\*([^*\n]+)\*(?![*\w])/g, "$1")
    .replace(/(?<![_\w])_([^_\n]+)_(?![_\w])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}
