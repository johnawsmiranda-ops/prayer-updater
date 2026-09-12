import { getCanvaConnection } from "@/lib/canva/connection";
import { getPrayersForCanvaSelection } from "@/lib/prayers";
import { summarizeCounts } from "@/lib/canva/mapping";
import CanvaClient from "@/components/CanvaClient";
import type { PrayerFilters } from "@/lib/prayers";

export const dynamic = "force-dynamic";

export default async function CanvaPage({ searchParams }: PageProps<"/canva">) {
  const sp = await searchParams;
  const get = (key: string) => (typeof sp[key] === "string" ? (sp[key] as string) : undefined);

  const ids = get("ids")?.split(",").filter(Boolean);
  const filters: PrayerFilters = {
    search: get("q"),
    year: get("year") ? Number(get("year")) : undefined,
    month: get("month") ? Number(get("month")) : undefined,
    category: get("category"),
    ministry: get("ministry"),
  };

  const [connection, prayers] = await Promise.all([
    getCanvaConnection(),
    getPrayersForCanvaSelection({ ids, filters }),
  ]);

  const summary = summarizeCounts(prayers);
  const hasFilters = Boolean(filters.year || filters.month || filters.category || filters.ministry || filters.search);

  return (
    <CanvaClient
      connection={connection}
      summary={summary}
      selection={{ ids, filters, hasFilters }}
      urlMessage={{ error: get("error"), connected: get("connected") === "1" }}
    />
  );
}
