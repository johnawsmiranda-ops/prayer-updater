import "server-only";
import crypto from "crypto";
import { loadDb, mutateDb } from "@/lib/store/workbook";
import type { Prayer, PrayerStatus } from "@/types/prayer";
import { CANONICAL_MINISTRIES, canonicalMinistriesFor } from "@/lib/ministries";

export interface PrayerFilters {
  search?: string;
  year?: number;
  month?: number; // 1-12, filters on date_added
  status?: PrayerStatus;
  category?: string;
  ministry?: string;
  needsReviewOnly?: boolean;
  reviewThresholdDays?: number;
}

export type SortKey = "newest" | "oldest" | "name" | "last_updated" | "status";

export interface ListPrayersOptions {
  filters?: PrayerFilters;
  sort?: SortKey;
  page?: number; // 1-based
  pageSize?: number;
}

export interface ListPrayersResult {
  prayers: Prayer[];
  total: number;
  page: number;
  pageSize: number;
}

function matchesFilters(p: Prayer, filters: PrayerFilters): boolean {
  if (filters.status && p.status !== filters.status) return false;
  if (filters.year && p.year !== filters.year) return false;
  if (filters.category && p.category !== filters.category) return false;
  if (filters.ministry && !canonicalMinistriesFor(p.assigned_ministry).includes(filters.ministry)) return false;
  if (filters.month && new Date(p.date_added).getMonth() + 1 !== filters.month) return false;

  if (filters.search && filters.search.trim().length > 0) {
    const haystack = [p.name, p.prayer_request, p.requested_by, p.category, p.assigned_ministry]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    const terms = filters.search.trim().toLowerCase().split(/\s+/);
    if (!terms.every((t) => haystack.includes(t))) return false;
  }

  if (filters.needsReviewOnly) {
    const threshold = filters.reviewThresholdDays ?? 45;
    const cutoff = Date.now() - threshold * 24 * 60 * 60 * 1000;
    if (p.status !== "ACTIVE" || new Date(p.last_updated).getTime() > cutoff) return false;
  }

  return true;
}

function compareBySort(sort: SortKey): (a: Prayer, b: Prayer) => number {
  switch (sort) {
    case "oldest":
      return (a, b) => new Date(a.date_added).getTime() - new Date(b.date_added).getTime();
    case "name":
      return (a, b) => a.name.localeCompare(b.name);
    case "last_updated":
      return (a, b) => new Date(b.last_updated).getTime() - new Date(a.last_updated).getTime();
    case "status":
      return (a, b) => a.status.localeCompare(b.status) || new Date(b.last_updated).getTime() - new Date(a.last_updated).getTime();
    case "newest":
    default:
      return (a, b) =>
        new Date(b.date_added).getTime() - new Date(a.date_added).getTime() ||
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  }
}

export async function listPrayers(options: ListPrayersOptions = {}): Promise<ListPrayersResult> {
  const { filters = {}, sort = "newest", page = 1, pageSize = 25 } = options;
  const db = await loadDb();

  const filtered = db.prayers.filter((p) => matchesFilters(p, filters)).sort(compareBySort(sort));
  const total = filtered.length;
  const from = (page - 1) * pageSize;
  const prayers = filtered.slice(from, from + pageSize);

  return { prayers, total, page, pageSize };
}

export async function getAllActivePrayers(): Promise<Prayer[]> {
  const db = await loadDb();
  return db.prayers
    .filter((p) => p.status === "ACTIVE")
    .sort((a, b) => a.category.localeCompare(b.category) || new Date(b.date_added).getTime() - new Date(a.date_added).getTime());
}

export async function getPrayerById(id: string): Promise<Prayer | null> {
  const db = await loadDb();
  return db.prayers.find((p) => p.id === id) ?? null;
}

export interface NewPrayerInput {
  year: number;
  name: string;
  prayer_request: string;
  requested_by?: string | null;
  category: string;
  assigned_ministry?: string | null;
  status?: PrayerStatus;
  notes?: string | null;
  date_added?: string;
}

export async function createPrayer(input: NewPrayerInput): Promise<Prayer> {
  return mutateDb((db) => {
    const ts = new Date().toISOString();
    const prayer: Prayer = {
      id: crypto.randomUUID(),
      year: input.year,
      name: input.name,
      prayer_request: input.prayer_request,
      requested_by: input.requested_by ?? null,
      category: input.category,
      assigned_ministry: input.assigned_ministry ?? null,
      status: input.status ?? "ACTIVE",
      notes: input.notes ?? null,
      date_added: input.date_added ?? ts.slice(0, 10),
      last_updated: ts,
      date_answered: null,
      source_status_raw: null,
      created_at: ts,
      updated_at: ts,
    };
    db.prayers.push(prayer);
    return prayer;
  });
}

export type PrayerUpdateInput = Partial<
  Pick<
    Prayer,
    | "year"
    | "name"
    | "prayer_request"
    | "requested_by"
    | "category"
    | "assigned_ministry"
    | "status"
    | "notes"
    | "date_answered"
  >
>;

export async function updatePrayer(id: string, input: PrayerUpdateInput): Promise<Prayer> {
  return mutateDb((db) => {
    const prayer = db.prayers.find((p) => p.id === id);
    if (!prayer) throw new Error(`Prayer ${id} not found`);

    const ts = new Date().toISOString();
    const statusChanged = input.status !== undefined && input.status !== prayer.status;
    const requestChanged = input.prayer_request !== undefined && input.prayer_request !== prayer.prayer_request;

    if (statusChanged || requestChanged) {
      db.history.push({
        id: crypto.randomUUID(),
        prayer_id: prayer.id,
        previous_status: prayer.status,
        new_status: input.status ?? prayer.status,
        previous_request: prayer.prayer_request,
        new_request: input.prayer_request ?? prayer.prayer_request,
        changed_at: ts,
        changed_by: "admin",
      });
    }

    Object.assign(prayer, input);
    prayer.updated_at = ts;
    if (statusChanged || requestChanged) prayer.last_updated = ts;

    return prayer;
  });
}

export async function markAnswered(id: string): Promise<Prayer> {
  return updatePrayer(id, {
    status: "ANSWERED",
    date_answered: new Date().toISOString().slice(0, 10),
  });
}

export async function archivePrayer(id: string): Promise<Prayer> {
  return updatePrayer(id, { status: "ARCHIVED" });
}

export async function reactivatePrayer(id: string): Promise<Prayer> {
  return updatePrayer(id, { status: "ACTIVE", date_answered: null });
}

export async function deletePrayer(id: string): Promise<void> {
  await bulkDeletePrayers([id]);
}

// --- Bulk variants ---------------------------------------------------------
// Each mutation (single or bulk) round-trips the whole workbook to Vercel
// Blob: a full read, then a full write. Calling the single-item helpers in a
// loop for a multi-select action means N of those full round trips back to
// back -- for a handful of selected rows that adds up to several seconds and
// feels like the delete button is stuck. Doing the whole batch inside ONE
// mutateDb call means exactly one read and one write no matter how many rows
// are selected.

function applyStatusToAll(
  db: Awaited<ReturnType<typeof loadDb>>,
  ids: string[],
  status: PrayerStatus,
  extra?: Partial<Pick<Prayer, "date_answered">>
) {
  const idSet = new Set(ids);
  const ts = new Date().toISOString();
  for (const prayer of db.prayers) {
    if (!idSet.has(prayer.id)) continue;
    if (prayer.status !== status) {
      db.history.push({
        id: crypto.randomUUID(),
        prayer_id: prayer.id,
        previous_status: prayer.status,
        new_status: status,
        previous_request: prayer.prayer_request,
        new_request: prayer.prayer_request,
        changed_at: ts,
        changed_by: "admin",
      });
    }
    prayer.status = status;
    if (extra) Object.assign(prayer, extra);
    prayer.updated_at = ts;
    prayer.last_updated = ts;
  }
}

export async function bulkMarkAnswered(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await mutateDb((db) => {
    applyStatusToAll(db, ids, "ANSWERED", { date_answered: new Date().toISOString().slice(0, 10) });
  });
}

export async function bulkArchivePrayers(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await mutateDb((db) => {
    applyStatusToAll(db, ids, "ARCHIVED");
  });
}

export async function bulkReactivatePrayers(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await mutateDb((db) => {
    applyStatusToAll(db, ids, "ACTIVE", { date_answered: null });
  });
}

export async function bulkDeletePrayers(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const idSet = new Set(ids);
  await mutateDb((db) => {
    db.prayers = db.prayers.filter((p) => !idSet.has(p.id));
    db.history = db.history.filter((h) => !idSet.has(h.prayer_id));
  });
}

export async function getPrayerHistory(prayerId: string) {
  const db = await loadDb();
  return db.history
    .filter((h) => h.prayer_id === prayerId)
    .sort((a, b) => new Date(b.changed_at).getTime() - new Date(a.changed_at).getTime());
}

export interface PrayerListCounts {
  total: number;
  active: number;
  answered: number;
  archived: number;
  needsReview: number;
}

export async function getPrayerCounts(reviewThresholdDays = 45): Promise<PrayerListCounts> {
  const db = await loadDb();
  const cutoff = Date.now() - reviewThresholdDays * 24 * 60 * 60 * 1000;
  const counts: PrayerListCounts = { total: 0, active: 0, answered: 0, archived: 0, needsReview: 0 };

  for (const p of db.prayers) {
    counts.total += 1;
    if (p.status === "ACTIVE") {
      counts.active += 1;
      if (new Date(p.last_updated).getTime() <= cutoff) counts.needsReview += 1;
    } else if (p.status === "ANSWERED") {
      counts.answered += 1;
    } else if (p.status === "ARCHIVED") {
      counts.archived += 1;
    }
  }

  return counts;
}

export async function getFilterOptions(): Promise<{
  years: number[];
  categories: string[];
  ministries: string[];
}> {
  const db = await loadDb();
  const years = new Set<number>();
  const categories = new Set<string>();

  for (const p of db.prayers) {
    if (p.year) years.add(p.year);
    if (p.category) categories.add(p.category);
  }

  return {
    years: Array.from(years).sort((a, b) => b - a),
    categories: Array.from(categories).sort(),
    // Filter dropdown always shows just the 4 canonical ministries (not raw
    // historical values like "Mens/Youth") — canonicalMinistriesFor() maps
    // each prayer's raw ministry text into one or more of these buckets, so
    // filtering by "Youth" also matches a prayer tagged "Mens/Youth".
    ministries: [...CANONICAL_MINISTRIES],
  };
}

/**
 * Resolves the prayer set for a Canva sync: either an explicit list of ids
 * (the admin selected specific rows on the Prayer List page) or the current
 * filters (year/category/ministry/search) — "publish selected" vs "publish
 * current filtered results". Only ACTIVE prayers are ever published,
 * regardless of the filters passed in.
 */
export async function getPrayersForCanvaSelection(options: {
  ids?: string[];
  filters?: PrayerFilters;
}): Promise<Prayer[]> {
  const db = await loadDb();

  if (options.ids && options.ids.length > 0) {
    const idSet = new Set(options.ids);
    return db.prayers.filter((p) => idSet.has(p.id) && p.status === "ACTIVE");
  }

  const filters = { ...(options.filters ?? {}), status: "ACTIVE" as PrayerStatus };
  return db.prayers
    .filter((p) => matchesFilters(p, filters))
    .sort((a, b) => a.category.localeCompare(b.category) || new Date(b.date_added).getTime() - new Date(a.date_added).getTime());
}
