import { listPrayers, getFilterOptions, getPrayerCounts, type SortKey } from "@/lib/prayers";
import { getNeedsReviewThreshold } from "@/lib/needsReview";
import PrayerListClient from "@/components/PrayerListClient";

export const dynamic = "force-dynamic";

export default async function ArchivePage({ searchParams }: PageProps<"/archive">) {
  const sp = await searchParams;
  const get = (key: string) => (typeof sp[key] === "string" ? (sp[key] as string) : undefined);

  const search = get("q");
  const year = get("year") ? Number(get("year")) : undefined;
  const month = get("month") ? Number(get("month")) : undefined;
  const category = get("category");
  const ministry = get("ministry");
  const sort = (get("sort") as SortKey | undefined) ?? "last_updated";
  const page = get("page") ? Number(get("page")) : 1;
  const threshold = getNeedsReviewThreshold();

  const [{ prayers, total, pageSize }, options, counts] = await Promise.all([
    listPrayers({
      filters: { search, year, month, status: "ARCHIVED", category, ministry },
      sort,
      page,
      pageSize: 25,
    }),
    getFilterOptions(),
    getPrayerCounts(threshold),
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
      currentFilters={{ search, year, month, category, ministry, sort }}
      archiveView
    />
  );
}
