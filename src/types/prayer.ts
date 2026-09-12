export type PrayerStatus = "ACTIVE" | "ANSWERED" | "ARCHIVED";

export interface Prayer {
  id: string;
  year: number;
  name: string;
  prayer_request: string;
  requested_by: string | null;
  category: string;
  assigned_ministry: string | null;
  status: PrayerStatus;
  notes: string | null;
  date_added: string; // date
  last_updated: string; // timestamptz
  date_answered: string | null; // date
  source_status_raw: string | null;
  created_at: string;
  updated_at: string;
}

export interface PrayerHistoryEntry {
  id: string;
  prayer_id: string;
  previous_status: PrayerStatus | null;
  new_status: PrayerStatus | null;
  previous_request: string | null;
  new_request: string | null;
  changed_at: string;
  changed_by: string;
}

export type CanvaConnectionStatus = "DISCONNECTED" | "CONNECTED" | "ERROR";

export interface CanvaConnection {
  id: string;
  user_id: string;
  template_id: string | null;
  design_id: string | null;
  template_name: string | null;
  connection_status: CanvaConnectionStatus;
  // access_token / refresh_token intentionally omitted from the client type —
  // they must never reach the browser.
  token_expires_at: string | null;
  field_mapping: Record<string, string>;
  last_synced_at: string | null;
  last_sync_summary: CanvaSyncSummary | null;
  created_at: string;
  updated_at: string;
}

export interface CanvaSyncSummary {
  total: number;
  byCategory: Record<string, number>;
  syncedAt: string;
  mode: "autofill" | "copy";
}

/** Standard prayer categories shown as filter options / suggested on Add Prayer. */
export const PRAYER_CATEGORIES = [
  "General Healing, Strength, and Wellness",
  "Ongoing Healing, Treatment, and Recovery",
  "Critical Healing and Urgent Medical Cases",
  "Employment",
  "Provision",
  "Spiritual Growth",
  "General",
] as const;

/** Standard ministries shown as filter options / suggested on Add Prayer. */
export const PRAYER_MINISTRIES = [
  "Youth",
  "Women",
  "Men's",
  "Mens/Youth",
  "Pastoral",
  "General",
] as const;

export const PRAYER_STATUSES: PrayerStatus[] = ["ACTIVE", "ANSWERED", "ARCHIVED"];

/** Number of days since last_updated after which an ACTIVE prayer is flagged. */
export const DEFAULT_NEEDS_REVIEW_DAYS = 45;
