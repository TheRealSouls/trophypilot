/**
 * Stops slurs and hate speech being posted anywhere members write. The word
 * list is ROT13-encoded so it doesn't sit in the code in plain text; it's
 * decoded once when the site starts.
 *
 * Before matching, text is folded: accents and look-alike letters from other
 * alphabets become plain letters, number and symbol swaps (1 for i, @ for a,
 * 0 for o) are undone, and letters may be repeated. The strongest slurs are
 * also caught with spaces or dots between their letters.
 * Everything else must be a whole word, so innocent words that merely
 * contain the letters (snigger, raccoon, Pakistan) stay allowed.
 */

const rot13 = (s: string) => s.replace(/[a-z]/g, (c) => String.fromCharCode(((c.charCodeAt(0) - 97 + 13) % 26) + 97));

// Caught inside other words too (but not right after an "s", which would block "snigger").
const STRONG = ["avttre", "avttn", "avttnu", "avtthu", "avttnm", "snttbg", "sntbg", "xvxr"].map(rot13);
// Whole words only, with plurals.
const WORDS = ["fcvp", "jrgonpx", "ornare", "tbbx", "enturnq", "gbjryurnq", "pbba", "cnxv", "tbyyvjbt", "jbt", "genaal", "genaavr", "ergneq", "ergneqrq", "wvtnobb", "mvccreurnq", "puvatpubat"].map(rot13);
const PHRASES = ["urvy uvgyre", "fvrt urvy", "tnf gur wrjf", "xvyy nyy wrjf", "xvyy nyy oynpxf", "xvyy nyy zhfyvzf", "xvyy nyy tnlf", "juvgr cbjre", "cbepu zbaxrl"].map(rot13);

// Letters from other alphabets that look like Latin ones.
const LOOKALIKES: Record<string, string> = { а: "a", е: "e", о: "o", р: "p", с: "c", у: "y", х: "x", і: "i", ј: "j", ѕ: "s", ԁ: "d", ɡ: "g", ո: "n", ν: "v", κ: "k", ο: "o" };
// Number and symbol swaps. Only tried as a second reading, so "heil!" still reads as "heil" first.
const SWAPS: Record<string, string> = {
  "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "9": "g", "@": "a", $: "s", "!": "i", "|": "i", "€": "e", "£": "e",
};

function fold(text: string, swaps: boolean) {
  const plain = text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f\u200b-\u200f\u2060\ufeff]/g, "")
    .toLowerCase()
    .replace(/./gu, (c) => LOOKALIKES[c] ?? c);
  return swaps ? plain.replace(/./gu, (c) => SWAPS[c] ?? c) : plain;
}

/** A word becomes each letter one or more times ("boss" matches b+ o+ s+ s+), with optional separators between letters when spaced is true. */
const letters = (word: string, spaced: boolean) => [...word].map((c) => `${c}+`).join(spaced ? "[^a-z]{0,3}" : "");

const STRONG_RE = new RegExp(`(?<![a-z])(?:${STRONG.map((w) => letters(w, true)).join("|")})|(?<![s])(?:${STRONG.map((w) => letters(w, false)).join("|")})`);
const WORDS_RE = new RegExp(`(?<![a-z])(?:${WORDS.map((w) => letters(w, false)).join("|")})(?:e?s)?(?![a-z])`);
const PHRASES_RE = new RegExp(`(?<![a-z])(?:${PHRASES.map((p) => p.split(" ").map((w) => letters(w, false)).join("[^a-z]+")).join("|")})(?![a-z])`);

export const HATE_MESSAGE = "That includes a slur or hate speech, which isn't allowed on TrophyPilot. Please reword it.";

/** True if any of the texts contains a slur or hate speech. */
export function hasHateSpeech(...texts: (string | null | undefined)[]) {
  return texts.some((t) => {
    if (!t) return false;
    const caught = (f: string) => STRONG_RE.test(f) || WORDS_RE.test(f) || PHRASES_RE.test(f);
    return caught(fold(t, false)) || caught(fold(t, true)) || /(?<![0-9])1488(?![0-9])/.test(t);
  });
}

/** Every piece of text a form sent, so a check covers all of its fields (guide steps included). */
export const formText = (fd: FormData) => [...fd.entries()].flatMap(([, v]) => (typeof v === "string" ? [v] : []));

/** For form actions: the error to show, or null when the text is fine. */
export const hateSpeechError = (...texts: (string | null | undefined)[]) => (hasHateSpeech(...texts) ? HATE_MESSAGE : null);
