/**
 * Why a moderator took something down. The author sees the reason in their
 * Notifications, with any note the moderator added.
 */
export const REMOVAL_REASONS = {
  SPAM: "Spam or advertising",
  ABUSE: "Harassment, hate or personal attacks",
  SPOILERS: "Spoilers without a warning",
  INAPPROPRIATE: "Inappropriate or explicit content",
  OFF_TOPIC: "Off topic or in the wrong place",
  CHEATING: "Promotes cheating, hacked trophies or paid boosting",
  RULES: "Against the community rules",
  OTHER: "Other",
} as const;
export type RemovalReason = keyof typeof REMOVAL_REASONS;
