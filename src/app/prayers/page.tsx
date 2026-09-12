import { listPrayers, getFilterOptions, getPrayerCounts, type SortKey } from "@/lib/prayers";
import { getNeedsReviewThreshold } from "@/lib/needsReview";
import { getCanvaConnection } from "@/lib/canva/connection";
import PrayerListClient from "@/components/PrayerListClient";
import type { PrayerStatus } from "@/types/prayer";

export const dynamic = "force-dynamic";

export default async function PrayersPage({ searchParams }: PageProps<"/prayers">) {
  const sp = await searchParams;
  const get = (key: string) => (typeof sp[key] === "string" ? (sp[key] as string) : undefined);

  const search = get("q");
  const year = get("year") ? Number(get("year")) : undefined;
  const month = get("month") ? Number(get("month")) : undefined;
  const status = get("status") as PrayerStatus | undefined;
  const category = get("category");
  const ministry = get("ministry");
  const sort = (get("sort") as SortKey | undefined) ?? "newest";
  const page = get("page") ? Number(get("page")) : 1;
  const pageSize = get("pageSize") ? Number(get("pageSize")) : 10;
  const needsReviewOnly = get("review") === "1";

  const threshold = getNeedsReviewThreshold();

  const [{ prayers, total }, options, counts, canvaConnection] = await Promise.all([
    listPrayers({
      filters: {
        search,
        year,
        month,
        status: status ?? undefined,
        category,
        ministry,
        needsReviewOnly,
        reviewThresholdDays: threshold,
      },
      sort,
      page,
      pageSize,
    }),
    getFilterOptions(),
    getPrayerCounts(threshold),
    getCanvaConnection(),
  ]);

  return (
    <PrayerListClient
      prayers={prayers}
      total={total}
      page={page}
      pageSize={pageSize}
      options={options}
      counts={counts}
      reviewThresholdDays={threshold}
      currentFilters={{ search, year, month, status, category, ministry, sort, needsReviewOnly }}
      canva={{ connected: canvaConnection.connection_status === "CONNECTED", lastSyncedAt: canvaConnection.last_synced_at }}
    />
  );
}
