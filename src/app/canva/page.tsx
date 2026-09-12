import { getCanvaConnection } from "@/lib/canva/connection";
import { getConnectedAccountName, getDesign } from "@/lib/canva/autofill";
import { getPrayersForCanvaSelection, getPrayerCounts } from "@/lib/prayers";
import { getNeedsReviewThreshold } from "@/lib/needsReview";
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

  const threshold = getNeedsReviewThreshold();

  const [connection, prayers, counts] = await Promise.all([
    getCanvaConnection(),
    getPrayersForCanvaSelection({ ids, filters }),
    getPrayerCounts(threshold),
  ]);

  const summary = summarizeCounts(prayers);
  const hasFilters = Boolean(filters.year || filters.month || filters.category || filters.ministry || filters.search);

  // Whether this deployment has a Canva Developer Portal app registered yet.
  // Until these three env vars are set, "Connect Canva" can never succeed —
  // we detect that up front so the UI can explain it calmly instead of
  // sending the admin through a dead-end OAuth redirect.
  const canvaConfigured = Boolean(
    process.env.CANVA_CLIENT_ID && process.env.CANVA_CLIENT_SECRET && process.env.CANVA_REDIRECT_URI
  );

  // Live Canva-side info (account name, design title/thumbnail) — best-effort:
  // if Canva is briefly unreachable, the page still renders with what we know
  // from our own stored connection state.
  let accountName: string | null = null;
  let design: Awaited<ReturnType<typeof getDesign>> | null = null;

  if (connection.connection_status === "CONNECTED") {
    const results = await Promise.allSettled([
      getConnectedAccountName(),
      connection.design_id ? getDesign(connection.design_id) : Promise.resolve(null),
    ]);
    if (results[0].status === "fulfilled") accountName = results[0].value;
    if (results[1].status === "fulfilled") design = results[1].value;
  }

  return (
    <CanvaClient
      connection={connection}
      accountName={accountName}
      design={design}
      summary={summary}
      counts={counts}
      selection={{ ids, filters, hasFilters }}
      urlMessage={{ error: get("error"), connected: get("connected") === "1" }}
      canvaConfigured={canvaConfigured}
    />
  );
}
