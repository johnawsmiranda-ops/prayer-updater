/**
 * The church's real Canva prayer design is organized into exactly 4
 * ministry sections (confirmed by the admin): Pastors, Mens, Youth, Women.
 * The historical prayer data (imported from the old Excel workbook) has
 * messier free-text values — things like "Mens/Youth" or "Pastor's/Women"
 * as a single combined string — so this module is the one place that maps
 * any raw ministry text down to those 4 clean buckets.
 *
 * This only changes what's *suggested* when adding/editing a prayer, and
 * how prayers are *grouped* for the Canva copy/paste export — it never
 * rewrites a prayer's stored `assigned_ministry` value, so nothing in the
 * historical data is lost or silently changed.
 */

export const CANONICAL_MINISTRIES = ["Pastors", "Mens", "Youth", "Women"] as const;
export type CanonicalMinistry = (typeof CANONICAL_MINISTRIES)[number];

const MINISTRY_RULES: { ministry: CanonicalMinistry; test: RegExp }[] = [
  { ministry: "Pastors", test: /pastor/i },
  { ministry: "Youth", test: /youth/i },
  { ministry: "Women", test: /wom[ae]n/i },
  { ministry: "Mens", test: /\bmen'?s?\b/i },
];

/**
 * Maps a raw ministry string to every one of the 4 canonical buckets it
 * matches. A combined value like "Mens/Youth" matches both Mens and
 * Youth — the prayer will appear under each, since duplicating it is far
 * less harmful than guessing which single ministry it "really" belongs to.
 * Returns ["Unassigned"] for empty/unset or unrecognized values.
 */
export function canonicalMinistriesFor(raw: string | null | undefined): string[] {
  if (!raw || !raw.trim()) return ["Unassigned"];
  const matches = MINISTRY_RULES.filter((rule) => rule.test.test(raw)).map((rule) => rule.ministry);
  return matches.length > 0 ? matches : ["Unassigned"];
}
