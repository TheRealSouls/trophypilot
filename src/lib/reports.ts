/** What members can report, and the reasons they can give (actions/reports.ts). */
export const REPORT_TYPES = ["FORUM_POST", "POST", "SESSION_COMMENT", "TIP", "GUIDE", "MESSAGE", "USER", "CLUB"] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export const REPORT_REASONS = {
  SPAM: "Spam or advertising",
  ABUSE: "Harassment, hate or threats",
  SPOILERS: "Spoilers that aren't marked",
  INAPPROPRIATE: "Inappropriate or explicit content",
  CHEATING: "Cheating, boosting for money or account selling",
  OTHER: "Something else",
} as const;

export const REPORT_TYPE_NAMES: Record<ReportType, string> = {
  FORUM_POST: "Forum post",
  POST: "Community update",
  SESSION_COMMENT: "Session comment",
  TIP: "Trophy tip",
  GUIDE: "Guide",
  MESSAGE: "Private message",
  USER: "Profile",
  CLUB: "Club",
};
