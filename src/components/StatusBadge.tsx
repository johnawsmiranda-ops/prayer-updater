import type { PrayerStatus } from "@/types/prayer";

const STYLES: Record<PrayerStatus, { bg: string; fg: string; label: string }> = {
  ACTIVE: { bg: "var(--green-soft)", fg: "var(--green)", label: "Active" },
  ANSWERED: { bg: "var(--purple-soft)", fg: "var(--purple)", label: "Answered" },
  ARCHIVED: { bg: "#eee", fg: "#666", label: "Archived" },
};

export default function StatusBadge({ status }: { status: PrayerStatus }) {
  const s = STYLES[status];
  return (
    <span className="badge" style={{ background: s.bg, color: s.fg }}>
      {s.label}
    </span>
  );
}

export function NeedsReviewBadge({ days }: { days: number }) {
  return (
    <span className="badge" style={{ background: "var(--amber-soft)", color: "var(--amber)" }}>
      ⚠️ Needs Review — {days}d
    </span>
  );
}
