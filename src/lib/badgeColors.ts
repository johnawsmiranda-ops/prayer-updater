import { bucketForPrayer, type PrayerBucket } from "@/lib/canva/mapping";

/** Category pill colors, keyed by the same buckets Canva publishing uses — so a
 * "Healing" prayer looks the same color everywhere in the app. */
const CATEGORY_COLORS: Record<PrayerBucket, { bg: string; fg: string }> = {
  HEALING: { bg: "#fbe2e6", fg: "#b3435f" },
  EMPLOYMENT: { bg: "#dbeafe", fg: "#1d4ed8" },
  PROVISION: { bg: "#fef3c7", fg: "#92600a" },
  FAMILIES: { bg: "#dcfce7", fg: "#15803d" },
  SPIRITUAL_GROWTH: { bg: "#ede9fe", fg: "#6d28d9" },
  GENERAL: { bg: "#ede9fe", fg: "#6d4c9c" },
};

export function categoryBadgeStyle(category: string): { bg: string; fg: string } {
  const bucket = bucketForPrayer({ category });
  return CATEGORY_COLORS[bucket];
}

/** Ministry labels get a stable color from a small palette, hashed by name
 * so the same ministry always renders the same color across the app. */
const MINISTRY_PALETTE = ["#1d4ed8", "#15803d", "#b3435f", "#92600a", "#6d28d9", "#0f766e", "#a21caf"];

export function ministryColor(ministry: string | null | undefined): string {
  if (!ministry) return "var(--muted)";
  let hash = 0;
  for (let i = 0; i < ministry.length; i++) hash = (hash * 31 + ministry.charCodeAt(i)) >>> 0;
  return MINISTRY_PALETTE[hash % MINISTRY_PALETTE.length];
}
