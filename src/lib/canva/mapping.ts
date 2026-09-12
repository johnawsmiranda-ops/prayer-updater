import type { Prayer } from "@/types/prayer";
import { CANONICAL_MINISTRIES, canonicalMinistriesFor } from "@/lib/ministries";

/**
 * Groups active prayers into the broad buckets the Canva template's fields
 * are organized around (spec section 10: HEALING, EMPLOYMENT, FAMILIES,
 * GENERAL, SPIRITUAL_GROWTH, ...). Category text is free-form in the data
 * (imported from the church's Excel categories), so we bucket by keyword
 * rather than requiring an exact match — the admin can always fine-tune the
 * field mapping in Settings.
 */
export type PrayerBucket =
  | "HEALING"
  | "EMPLOYMENT"
  | "PROVISION"
  | "FAMILIES"
  | "SPIRITUAL_GROWTH"
  | "GENERAL";

const BUCKET_RULES: { bucket: PrayerBucket; test: RegExp }[] = [
  { bucket: "HEALING", test: /heal|health|medical|recovery|sick|surgery|hospital/i },
  { bucket: "EMPLOYMENT", test: /employ|job|work|career|visa/i },
  { bucket: "PROVISION", test: /provision|financ|business|supply/i },
  { bucket: "SPIRITUAL_GROWTH", test: /spiritual|faith|wisdom|growth/i },
  { bucket: "FAMILIES", test: /famil/i },
];

export const BUCKET_LABELS: Record<PrayerBucket, string> = {
  HEALING: "Healing",
  EMPLOYMENT: "Employment",
  PROVISION: "Provision",
  FAMILIES: "Families",
  SPIRITUAL_GROWTH: "Spiritual Growth",
  GENERAL: "General",
};

export function bucketForPrayer(prayer: Pick<Prayer, "category">): PrayerBucket {
  for (const rule of BUCKET_RULES) {
    if (rule.test.test(prayer.category)) return rule.bucket;
  }
  return "GENERAL";
}

export function groupPrayersByBucket(prayers: Prayer[]): Record<PrayerBucket, Prayer[]> {
  const groups: Record<PrayerBucket, Prayer[]> = {
    HEALING: [],
    EMPLOYMENT: [],
    PROVISION: [],
    FAMILIES: [],
    SPIRITUAL_GROWTH: [],
    GENERAL: [],
  };
  for (const prayer of prayers) {
    groups[bucketForPrayer(prayer)].push(prayer);
  }
  return groups;
}

export function summarizeCounts(prayers: Prayer[]): { total: number; byBucket: Record<string, number> } {
  const groups = groupPrayersByBucket(prayers);
  const byBucket: Record<string, number> = {};
  for (const [bucket, list] of Object.entries(groups)) {
    if (list.length > 0) byBucket[BUCKET_LABELS[bucket as PrayerBucket]] = list.length;
  }
  return { total: prayers.length, byBucket };
}

function formatPrayerLine(p: Prayer): string {
  const who = p.name;
  const req = p.prayer_request.trim();
  return req ? `${who} — ${req}` : who;
}

/** Default field mapping: Canva field name -> bucket, matching spec section 10. */
export const DEFAULT_FIELD_MAPPING: Record<string, PrayerBucket> = {
  HEALING_PRAYERS: "HEALING",
  EMPLOYMENT_PRAYERS: "EMPLOYMENT",
  FAMILY_PRAYERS: "FAMILIES",
  GENERAL_PRAYERS: "GENERAL",
  SPIRITUAL_GROWTH_PRAYERS: "SPIRITUAL_GROWTH",
};

/**
 * Builds the Canva Autofill `data` payload: one text field per mapped
 * bucket, each field's text being that bucket's prayers joined by newlines.
 * `fieldMapping` comes from canva_connections.field_mapping (Canva field
 * name -> bucket name), so the admin can adapt it to their template.
 */
export function buildAutofillTextData(
  prayers: Prayer[],
  fieldMapping: Record<string, string> = DEFAULT_FIELD_MAPPING
): Record<string, { type: "text"; text: string }> {
  const groups = groupPrayersByBucket(prayers);
  const data: Record<string, { type: "text"; text: string }> = {};

  for (const [fieldName, bucket] of Object.entries(fieldMapping)) {
    const list = groups[bucket as PrayerBucket] ?? [];
    data[fieldName] = {
      type: "text",
      text: list.length > 0 ? list.map(formatPrayerLine).join("\n") : "—",
    };
  }

  return data;
}

/**
 * Groups prayers into the church's 4 real ministry sections — Pastors,
 * Mens, Youth, Women — matching how the Canva design's pages are actually
 * laid out. Raw `assigned_ministry` text (free-form, imported from the old
 * Excel data) is mapped down to these 4 buckets via canonicalMinistriesFor;
 * a combined value like "Mens/Youth" puts that prayer in both buckets
 * rather than guessing which one it "really" belongs to. Prayers with no
 * recognizable ministry land in "Unassigned".
 */
export function groupPrayersByMinistry(prayers: Prayer[]): Record<string, Prayer[]> {
  const groups: Record<string, Prayer[]> = {};
  for (const ministry of CANONICAL_MINISTRIES) groups[ministry] = [];
  groups["Unassigned"] = [];

  for (const prayer of prayers) {
    for (const bucket of canonicalMinistriesFor(prayer.assigned_ministry)) {
      if (!groups[bucket]) groups[bucket] = [];
      groups[bucket].push(prayer);
    }
  }
  return groups;
}

const MINISTRY_ORDER = [...CANONICAL_MINISTRIES, "Unassigned"];

/**
 * Plain-text export grouped by ministry — for pasting into a Canva design
 * (like the church's existing multi-page file) that's organized by
 * ministry page rather than by prayer category. "Unassigned" (prayers
 * whose ministry couldn't be matched) is listed last so it doesn't get
 * lost among the 4 real sections.
 */
export function buildCopyForCanvaTextByMinistry(prayers: Prayer[]): string {
  const groups = groupPrayersByMinistry(prayers);
  const lines: string[] = [];
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  lines.push(`PRAYER LIST — Updated ${today}`);
  lines.push("");

  for (const ministry of MINISTRY_ORDER) {
    const list = groups[ministry];
    if (!list || list.length === 0) continue;
    lines.push(ministry.toUpperCase());
    for (const p of list) {
      lines.push(`• ${formatPrayerLine(p)}`);
    }
    lines.push("");
  }

  return lines.join("\n").trim();
}

/**
 * Same grouping, but returned as one block per section instead of one big
 * blob of text — so the admin can copy just the "Pastors" block, paste it
 * into the Pastors slide, then come back for "Mens," and so on, without
 * having to manually cut the combined text apart themselves.
 */
export function buildCopyBlocksByMinistry(prayers: Prayer[]): { label: string; count: number; text: string }[] {
  const groups = groupPrayersByMinistry(prayers);
  const blocks: { label: string; count: number; text: string }[] = [];

  for (const ministry of MINISTRY_ORDER) {
    const list = groups[ministry];
    if (!list || list.length === 0) continue;
    blocks.push({
      label: ministry,
      count: list.length,
      text: list.map((p) => `• ${formatPrayerLine(p)}`).join("\n"),
    });
  }

  return blocks;
}

/** Same idea as buildCopyBlocksByMinistry, but grouped by prayer category
 * bucket instead — for the "Category" grouping toggle. */
export function buildCopyBlocksByCategory(prayers: Prayer[]): { label: string; count: number; text: string }[] {
  const groups = groupPrayersByBucket(prayers);
  const blocks: { label: string; count: number; text: string }[] = [];

  for (const bucket of Object.keys(BUCKET_LABELS) as PrayerBucket[]) {
    const list = groups[bucket];
    if (!list || list.length === 0) continue;
    blocks.push({
      label: BUCKET_LABELS[bucket],
      count: list.length,
      text: list.map((p) => `• ${formatPrayerLine(p)}`).join("\n"),
    });
  }

  return blocks;
}

/** Plain-text export for the "Copy for Canva" fallback — no API access required. */
export function buildCopyForCanvaText(prayers: Prayer[]): string {
  const groups = groupPrayersByBucket(prayers);
  const lines: string[] = [];
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  lines.push(`PRAYER LIST — Updated ${today}`);
  lines.push("");

  for (const bucket of Object.keys(BUCKET_LABELS) as PrayerBucket[]) {
    const list = groups[bucket];
    if (list.length === 0) continue;
    lines.push(BUCKET_LABELS[bucket].toUpperCase());
    for (const p of list) {
      lines.push(`• ${formatPrayerLine(p)}`);
    }
    lines.push("");
  }

  return lines.join("\n").trim();
}
