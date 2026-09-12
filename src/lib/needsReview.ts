import { differenceInCalendarDays } from "date-fns";
import type { Prayer } from "@/types/prayer";
import { DEFAULT_NEEDS_REVIEW_DAYS } from "@/types/prayer";

/**
 * A prayer "needs review" when it's still ACTIVE but hasn't been touched
 * (edited, or had its status changed) in `thresholdDays`. We never delete or
 * auto-archive anything — this is purely a UI flag the admin acts on.
 */
export function daysSinceUpdate(prayer: Pick<Prayer, "last_updated">): number {
  return differenceInCalendarDays(new Date(), new Date(prayer.last_updated));
}

export function needsReview(
  prayer: Pick<Prayer, "status" | "last_updated">,
  thresholdDays: number = DEFAULT_NEEDS_REVIEW_DAYS
): boolean {
  if (prayer.status !== "ACTIVE") return false;
  return daysSinceUpdate(prayer) >= thresholdDays;
}

export function getNeedsReviewThreshold(): number {
  const raw = process.env.NEXT_PUBLIC_NEEDS_REVIEW_DAYS;
  const parsed = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_NEEDS_REVIEW_DAYS;
}
