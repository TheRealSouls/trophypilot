/**
 * Site-wide identity and legal details. Operator details come from env so a
 * deployment can set them without code changes; the defaults are placeholders
 * that must be replaced before launch.
 */
export const SITE = {
  name: "TrophyPilot",
  tagline: "PlayStation trophy tracking, guides and leaderboards",
  url: process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
  operator: process.env.SITE_OPERATOR_NAME || "the TrophyPilot team",
  // Formspree form behind /contact. Form ids are public (they end up in the page).
  formspreeFormId: process.env.NEXT_PUBLIC_FORMSPREE_FORM_ID || "xljdozjl",
  // Irish law and the Irish Data Protection Commission; the terms and privacy policy are written for it.
  jurisdiction: "Ireland",
  legalUpdated: "30 September 2026",
} as const;
