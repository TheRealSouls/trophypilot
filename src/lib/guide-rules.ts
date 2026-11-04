/** The rules shown beside the guide editor until an admin writes their own (staff dashboard, Forum rules tab). */
export const DEFAULT_GUIDE_RULES = [
  ["Only write what you've done", "Guides should come from your own platinum run, or trophies you've earned yourself. Don't copy other sites' guides."],
  ["Missables first", "Flag anything that can be missed before the step where it can be missed, and say how to avoid it."],
  ["Be accurate", "Give real estimates for time, difficulty and playthroughs. Mark online trophies and anything that needs a second player."],
  ["Mark spoilers", "Hide story details behind spoilers, and keep them out of step titles."],
  ["No cheats or exploits that risk accounts", "Glitches are fine if they're safe; save editing, hacking and paid boosting aren't."],
  ["Staff review", "Guides from new writers are checked by staff before they go public. Edits to a published guide may be reviewed again."],
]
  .map(([title, text]) => `${title}\n${text}`)
  .join("\n\n");
