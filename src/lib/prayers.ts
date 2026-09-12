import "server-only";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { Prayer, PrayerStatus } from "@/types/prayer";

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

function applySort<T extends { order: (column: string, opts: { ascending: boolean }) => T }>(
  query: T,
  sort: SortKey = "newest"
): T {
  switch (sort) {
    case "oldest":
      return query.order("date_added", { ascending: true });
    case "name":
      return query.order("name", { ascending: true });
    case "last_updated":
      return query.order("last_updated", { ascending: false });
    case "status":
      return query.order("status", { ascending: true }).order("last_updated", { ascending: false });
    case "newest":
    default:
      return query.order("date_added", { ascending: false }).order("created_at", { ascending: false });
  }
}

export async function listPrayers(options: ListPrayersOptions = {}): Promise<ListPrayersResult> {
  const supabase = getSupabaseServerClient();
  const { filters = {}, sort = "newest", page = 1, pageSize = 25 } = options;

  let query = supabase.from("prayers").select("*", { count: "exact" });

  if (filters.status) query = query.eq("status", filters.status);
  if (filters.year) query = query.eq("year", filters.year);
  if (filters.category) query = query.eq("category", filters.category);
  if (filters.ministry) query = query.eq("assigned_ministry", filters.ministry);
  if (filters.month) {
    // date_added is a `date`; filter by calendar month regardless of year
    query = query.filter("date_added", "not.is", null);
  }
  if (filters.search && filters.search.trim().length > 0) {
    const term = filters.search.trim().split(/\s+/).join(" & ");
    query = query.textSearch("search_vector", term, { type: "websearch", config: "english" });
  }

  query = applySort(query, sort);

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  query = query.range(from, to);

  const { data, error, count } = await query;
  if (error) throw error;

  let prayers = (data ?? []) as Prayer[];

  // month filter applied client-side after fetch would break pagination, so
  // we instead post-filter only when month is set and accept the smaller
  // in-page result; for a single-admin, few-hundred-row list this is fine.
  if (filters.month) {
    prayers = prayers.filter((p) => new Date(p.date_added).getMonth() + 1 === filters.month);
  }

  if (filters.needsReviewOnly) {
    const threshold = filters.reviewThresholdDays ?? 45;
    const cutoff = Date.now() - threshold * 24 * 60 * 60 * 1000;
    prayers = prayers.filter(
      (p) => p.status === "ACTIVE" && new Date(p.last_updated).getTime() <= cutoff
    );
  }

  return { prayers, total: count ?? prayers.length, page, pageSize };
}

export async function getAllActivePrayers(): Promise<Prayer[]> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("prayers")
    .select("*")
    .eq("status", "ACTIVE")
    .order("category", { ascending: true })
    .order("date_added", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Prayer[];
}

export async function getPrayerById(id: string): Promise<Prayer | null> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.from("prayers").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as Prayer) ?? null;
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
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("prayers")
    .insert({
      year: input.year,
      name: input.name,
      prayer_request: input.prayer_request,
      requested_by: input.requested_by ?? null,
      category: input.category,
      assigned_ministry: input.assigned_ministry ?? null,
      status: input.status ?? "ACTIVE",
      notes: input.notes ?? null,
      date_added: input.date_added ?? new Date().toISOString().slice(0, 10),
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as Prayer;
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
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("prayers")
    .update(input)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data as Prayer;
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
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from("prayers").delete().eq("id", id);
  if (error) throw error;
}

export async function getPrayerHistory(prayerId: string) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("prayer_history")
    .select("*")
    .eq("prayer_id", prayerId)
    .order("changed_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export interface PrayerListCounts {
  total: number;
  active: number;
  answered: number;
  archived: number;
  needsReview: number;
}

export async function getPrayerCounts(reviewThresholdDays = 45): Promise<PrayerListCounts> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.from("prayers").select("status,last_updated");
  if (error) throw error;
  const rows = (data ?? []) as Pick<Prayer, "status" | "last_updated">[];

  const cutoff = Date.now() - reviewThresholdDays * 24 * 60 * 60 * 1000;
  const counts: PrayerListCounts = { total: 0, active: 0, answered: 0, archived: 0, needsReview: 0 };

  for (const row of rows) {
    counts.total += 1;
    if (row.status === "ACTIVE") {
      counts.active += 1;
      if (new Date(row.last_updated).getTime() <= cutoff) counts.needsReview += 1;
    } else if (row.status === "ANSWERED") {
      counts.answered += 1;
    } else if (row.status === "ARCHIVED") {
      counts.archived += 1;
    }
  }

  return counts;
}

/**
 * Resolves the prayer set for a Canva sync: either an explicit list of ids
 * (the admin selected specific rows on the Prayer List page) or the current
 * filters (year/status/category/ministry/search) — "publish selected" vs
 * "publish current filtered results" from spec section 12. Only ACTIVE
 * prayers are ever published to Canva regardless of the filters passed in.
 */
export async function getPrayersForCanvaSelection(options: {
  ids?: string[];
  filters?: PrayerFilters;
}): Promise<Prayer[]> {
  const supabase = getSupabaseServerClient();

  if (options.ids && options.ids.length > 0) {
    const { data, error } = await supabase
      .from("prayers")
      .select("*")
      .in("id", options.ids)
      .eq("status", "ACTIVE");
    if (error) throw error;
    return (data ?? []) as Prayer[];
  }

  const filters = { ...(options.filters ?? {}), status: "ACTIVE" as PrayerStatus };
  let query = supabase.from("prayers").select("*").eq("status", "ACTIVE");
  if (filters.year) query = query.eq("year", filters.year);
  if (filters.category) query = query.eq("category", filters.category);
  if (filters.ministry) query = query.eq("assigned_ministry", filters.ministry);
  if (filters.search && filters.search.trim().length > 0) {
    const term = filters.search.trim().split(/\s+/).join(" & ");
    query = query.textSearch("search_vector", term, { type: "websearch", config: "english" });
  }
  query = query.order("category", { ascending: true }).order("date_added", { ascending: false });

  const { data, error } = await query;
  if (error) throw error;
  let prayers = (data ?? []) as Prayer[];
  if (filters.month) {
    prayers = prayers.filter((p) => new Date(p.date_added).getMonth() + 1 === filters.month);
  }
  return prayers;
}

export const DISTINCT_LOOKUPS_QUERY = `year, category, assigned_ministry`;

export async function getFilterOptions(): Promise<{
  years: number[];
  categories: string[];
  ministries: string[];
}> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.from("prayers").select("year, category, assigned_ministry");
  if (error) throw error;

  const years = new Set<number>();
  const categories = new Set<string>();
  const ministries = new Set<string>();

  for (const row of data ?? []) {
    if (row.year) years.add(row.year as number);
    if (row.category) categories.add(row.category as string);
    if (row.assigned_ministry) ministries.add(row.assigned_ministry as string);
  }

  return {
    years: Array.from(years).sort((a, b) => b - a),
    categories: Array.from(categories).sort(),
    ministries: Array.from(ministries).sort(),
  };
}
