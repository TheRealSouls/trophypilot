/**
 * The forum rules as staff write them: one rule per block, blocks separated
 * by a blank line, the block's first line its title and the rest its text.
 */
export const DEFAULT_FORUM_RULES = [
  ["Be decent to each other", "Argue about games, not people. No harassment, hate, threats or personal attacks."],
  ["Post in the right place", "Pick the section that fits and give your thread a clear title. Search first: someone may have asked already."],
  ["Mark spoilers", "Put a spoiler warning in the title and keep story details out of thread titles."],
  ["No cheating presented as legitimate", "Don't share hacked saves, mods or exploits that get accounts banned, and don't boast about using them."],
  ["No selling", "No paid boosting, account selling or sharing, and no advertising. Free boosting belongs in Sessions."],
  ["No piracy", "Don't post or ask for pirated games, keys or leaked content."],
  ["Keep it legal and safe for work", "Nothing illegal, sexually explicit or gory. No one else's private information."],
  ["One account each", "Don't create extra accounts to dodge a suspension or to back yourself up in an argument."],
  [
    "Staff have the last word",
    "Staff can edit, move, lock or remove posts that break these rules. If you disagree, message a member of staff. Don't argue it out in the thread.",
  ],
]
  .map(([title, text]) => `${title}\n${text}`)
  .join("\n\n");

export function parseRules(source: string) {
  return source
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const [title, ...rest] = block.split("\n");
      return { title: title.replace(/^#+\s*|^\d+[.)]\s*/, "").trim(), text: rest.join("\n").trim() };
    });
}
