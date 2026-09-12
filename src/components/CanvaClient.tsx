"use client";

import { useState, useTransition } from "react";
import type { CanvaConnection } from "@/types/prayer";
import type { PrayerFilters } from "@/lib/prayers";
import type { PrayerListCounts } from "@/lib/prayers";
import type { CanvaDesign } from "@/lib/canva/autofill";
import { BUCKET_LABELS, DEFAULT_FIELD_MAPPING, type PrayerBucket } from "@/lib/canva/mapping";
import {
  connectManualTemplateAction,
  disconnectCanvaAction,
  updateFieldMappingAction,
  updateCanvaAction,
  listAvailableBrandTemplatesAction,
  selectBrandTemplateAction,
  getEditInCanvaUrlAction,
  syncFromCanvaAction,
  type UpdateCanvaResult,
  type SyncFromCanvaResult,
} from "@/app/canva/actions";
import { formatDate, formatRelative } from "@/lib/format";

interface Props {
  connection: CanvaConnection;
  accountName: string | null;
  design: CanvaDesign | null;
  summary: { total: number; byBucket: Record<string, number> };
  counts: PrayerListCounts;
  selection: { ids?: string[]; filters?: PrayerFilters; hasFilters: boolean };
  urlMessage: { error?: string; connected: boolean };
  canvaConfigured: boolean;
}

const BUCKETS = Object.keys(BUCKET_LABELS) as PrayerBucket[];

function invertMapping(fieldMapping: Record<string, string>): Record<PrayerBucket, string> {
  const inverted = {} as Record<PrayerBucket, string>;
  for (const bucket of BUCKETS) inverted[bucket] = "";
  for (const [field, bucket] of Object.entries(fieldMapping)) {
    inverted[bucket as PrayerBucket] = field;
  }
  return inverted;
}

export default function CanvaClient({ connection, accountName, design, summary, counts, selection, urlMessage, canvaConfigured }: Props) {
  const connected = connection.connection_status === "CONNECTED";
  const hasDesign = Boolean(connection.design_id);

  // When the Canva Developer Portal app isn't registered yet, the
  // ConnectionCard below explains that calmly on its own — showing the raw
  // "Missing CANVA_CLIENT_ID" redirect error on top of it would just repeat
  // the same thing in a scarier voice, so we suppress it in that case.
  const showErrorBanner = Boolean(urlMessage.error) && (canvaConfigured || !/CANVA_CLIENT_ID/.test(urlMessage.error ?? ""));

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-app-serif)] text-2xl md:text-3xl font-semibold text-[var(--accent-strong)]">
          🎨 Canva
        </h1>
        <p className="text-sm text-[var(--muted)] mt-1">
          Prayer List → Canva → Publish. Manage prayers here, then keep the Canva design in sync.
        </p>
      </div>

      {showErrorBanner && (
        <Banner tone="red">{urlMessage.error}</Banner>
      )}
      {urlMessage.connected && <Banner tone="green">🟢 Canva connected successfully.</Banner>}

      <ConnectionCard connected={connected} accountName={accountName} canvaConfigured={canvaConfigured} />

      <UpdateCanvaCard
        connected={connected}
        hasDesign={hasDesign}
        summary={summary}
        counts={counts}
        selection={selection}
        lastSyncedAt={connection.last_synced_at}
      />

      <DesignCard
        connection={connection}
        connected={connected}
        design={design}
      />
    </div>
  );
}

function Banner({ tone, children }: { tone: "red" | "green" | "amber"; children: React.ReactNode }) {
  const styles = {
    red: { bg: "var(--red-soft)", fg: "var(--red)" },
    green: { bg: "var(--green-soft)", fg: "var(--green)" },
    amber: { bg: "var(--amber-soft)", fg: "var(--amber)" },
  }[tone];
  return (
    <div className="card p-4" style={{ background: styles.bg }}>
      <p className="text-sm" style={{ color: styles.fg }}>
        {children}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card 1 — Canva Connection (the account-level OAuth connection)
// ---------------------------------------------------------------------------

function ConnectionCard({
  connected,
  accountName,
  canvaConfigured,
}: {
  connected: boolean;
  accountName: string | null;
  canvaConfigured: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [manageOpen, setManageOpen] = useState(false);

  return (
    <section className="card p-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="text-sm font-semibold mb-1">Canva Connection</div>
          <div className="text-sm">
            {connected ? (
              <span style={{ color: "var(--green)" }}>
                🟢 Connected{accountName ? ` as ${accountName}` : ""}
              </span>
            ) : !canvaConfigured ? (
              <span style={{ color: "var(--amber)" }}>🚧 Under Construction</span>
            ) : (
              <span style={{ color: "var(--red)" }}>🔴 Not Connected</span>
            )}
          </div>
        </div>
        {!connected ? (
          canvaConfigured ? (
            <a href="/api/canva/oauth/start" className="btn btn-purple">
              + Connect Canva
            </a>
          ) : (
            <button className="btn btn-purple" disabled title="Under construction — use the copy-paste sections below for now">
              + Connect Canva
            </button>
          )
        ) : (
          <button className="btn btn-secondary" onClick={() => setManageOpen((v) => !v)}>
            Manage Connection
          </button>
        )}
      </div>

      {!connected && canvaConfigured && (
        <p className="text-xs text-[var(--muted)] mt-3">
          Canva authorization is required before this app can update or open your design — pasting a Canva
          link by itself doesn&apos;t grant edit access. Connect Canva uses Canva&apos;s own sign-in, and your
          Canva password is never seen by this app.
        </p>
      )}

      {!connected && !canvaConfigured && (
        <div className="mt-3 rounded-lg p-3 text-xs" style={{ background: "var(--amber-soft)", color: "var(--amber)" }}>
          <p className="font-medium mb-1">🚧 Direct Canva sync is under construction.</p>
          <p>
            For now, use the <strong>Update Canva</strong> section below — it prepares each ministry&apos;s prayers
            as ready-to-copy text you can paste straight into your Canva design.
          </p>
          <details className="mt-2">
            <summary className="cursor-pointer">Setup details (for later)</summary>
            <p className="mt-1">
              To turn on live Canva sync, create an integration at{" "}
              <span className="underline">canva.com/developers</span>, then add these three values to{" "}
              <code>.env.local</code> and restart the dev server:
            </p>
            <p className="font-mono mt-1">CANVA_CLIENT_ID</p>
            <p className="font-mono">CANVA_CLIENT_SECRET</p>
            <p className="font-mono">CANVA_REDIRECT_URI=http://localhost:3000/api/canva/oauth/callback</p>
          </details>
        </div>
      )}

      {connected && manageOpen && (
        <div className="mt-4 pt-4 border-t border-[var(--border)]">
          <p className="text-sm text-[var(--muted)] mb-3">
            Disconnecting removes this app&apos;s access to your Canva account. Your connected design and field
            mapping stay saved for next time.
          </p>
          <button
            className="btn btn-secondary"
            disabled={isPending}
            onClick={() => startTransition(() => disconnectCanvaAction())}
          >
            Disconnect Canva
          </button>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Card 2 — Update Canva (the primary action)
// ---------------------------------------------------------------------------

function UpdateCanvaCard({
  connected,
  hasDesign,
  summary,
  counts,
  selection,
  lastSyncedAt,
}: {
  connected: boolean;
  hasDesign: boolean;
  summary: { total: number; byBucket: Record<string, number> };
  counts: PrayerListCounts;
  selection: { ids?: string[]; filters?: PrayerFilters; hasFilters: boolean };
  lastSyncedAt: string | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [result, setResult] = useState<UpdateCanvaResult | null>(null);
  const [groupBy, setGroupBy] = useState<"ministry" | "category">("ministry");

  const scopeLabel =
    selection.ids && selection.ids.length > 0
      ? `${selection.ids.length} selected prayer${selection.ids.length === 1 ? "" : "s"}`
      : selection.hasFilters
        ? "current filtered results"
        : "all active prayers";

  const runUpdate = () => {
    startTransition(() => {
      updateCanvaAction({ ids: selection.ids, filters: selection.filters }, groupBy).then((res) => {
        setResult(res);
        setConfirmOpen(false);
      });
    });
  };

  return (
    <section className="card p-5 border-2" style={{ borderColor: "var(--purple)" }}>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-1">
        <div className="text-base font-semibold">🟣 Update Canva</div>
      </div>
      <p className="text-sm text-[var(--muted)] mb-3">
        Update the connected Canva prayer list using the latest prayer data.
      </p>

      <div className="grid grid-cols-3 gap-3 mb-3 text-center">
        <Stat label="Active" value={counts.active} />
        <Stat label="Needs Review" value={counts.needsReview} />
        <Stat label="Answered" value={counts.answered} />
      </div>

      <div className="text-xs text-[var(--muted)] mb-3">
        Publishing: <strong>{scopeLabel}</strong> ({summary.total} prayers)
        {lastSyncedAt && <> · Last updated: {formatDate(lastSyncedAt)}</>}
        {!connected && <> · Canva not connected — this will prepare text instead of updating live</>}
        {connected && !hasDesign && <> · No design connected yet — this will prepare text instead</>}
      </div>

      <div className="flex items-center gap-2 mb-4 text-xs">
        <span className="text-[var(--muted)]">Group prepared text by:</span>
        <button
          className={groupBy === "ministry" ? "btn btn-secondary" : "btn btn-ghost"}
          style={{ padding: "2px 10px", fontSize: 12 }}
          onClick={() => setGroupBy("ministry")}
        >
          Ministry
        </button>
        <button
          className={groupBy === "category" ? "btn btn-secondary" : "btn btn-ghost"}
          style={{ padding: "2px 10px", fontSize: 12 }}
          onClick={() => setGroupBy("category")}
        >
          Category
        </button>
      </div>

      {!confirmOpen ? (
        <button className="btn btn-purple" onClick={() => setConfirmOpen(true)}>
          Update Canva
        </button>
      ) : (
        <div className="space-y-3">
          <p className="text-sm">
            This will publish <strong>{scopeLabel}</strong> ({summary.total} prayers) to{" "}
            {connected && hasDesign ? "your connected Canva design" : "a ready-to-paste text export"}.
          </p>
          <div className="flex gap-2">
            <button className="btn btn-purple" disabled={isPending} onClick={runUpdate}>
              {isPending ? "Updating…" : "Update Canva"}
            </button>
            <button className="btn btn-secondary" onClick={() => setConfirmOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {result && <UpdateResultPanel result={result} />}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg p-3" style={{ background: "var(--accent-soft)" }}>
      <div className="text-xl font-semibold text-[var(--accent-strong)]">{value}</div>
      <div className="text-xs text-[var(--muted)] mt-0.5">{label}</div>
    </div>
  );
}

function UpdateResultPanel({ result }: { result: UpdateCanvaResult }) {
  if (result.mode === "error") {
    return (
      <div className="mt-4 pt-4 border-t border-[var(--border)]">
        <p className="text-sm text-[var(--red)]">{result.error}</p>
      </div>
    );
  }

  if (result.mode === "autofill" && result.summary) {
    return (
      <div className="mt-4 pt-4 border-t border-[var(--border)]">
        <p className="text-sm" style={{ color: "var(--green)" }}>
          ✓ Canva Prayer List Updated
        </p>
        <p className="text-sm text-[var(--muted)] mt-1">
          {result.summary.total} active prayers synced. Updated{" "}
          {new Date(result.summary.syncedAt).toLocaleString()}.
        </p>
        {result.designUrl && (
          <a href={result.designUrl} target="_blank" rel="noreferrer" className="btn btn-secondary mt-2">
            Open in Canva
          </a>
        )}
      </div>
    );
  }

  if (result.mode === "prepared" && result.copyText) {
    return (
      <div className="mt-4 pt-4 border-t border-[var(--border)] space-y-4">
        <p className="text-sm" style={{ color: "var(--amber)" }}>
          🟡 Prepared Canva Update — {result.reason}
        </p>

        {result.copyBlocks && result.copyBlocks.length > 0 ? (
          <>
            <p className="text-xs text-[var(--muted)]">
              Copy each section below and paste it into that ministry&apos;s slide in Canva.
            </p>
            <div className="space-y-3">
              {result.copyBlocks.map((block) => (
                <CopyBlock key={block.label} label={block.label} count={block.count} text={block.text} />
              ))}
            </div>
          </>
        ) : (
          <div>
            <textarea className="input font-mono text-xs" rows={10} readOnly value={result.copyText} />
            <button
              className="btn btn-secondary mt-2"
              onClick={() => navigator.clipboard.writeText(result.copyText ?? "")}
            >
              Copy to Clipboard
            </button>
          </div>
        )}

        <details className="text-xs text-[var(--muted)]">
          <summary className="cursor-pointer">Copy everything as one block instead</summary>
          <textarea className="input font-mono text-xs mt-2" rows={8} readOnly value={result.copyText} />
          <button
            className="btn btn-secondary mt-2"
            onClick={() => navigator.clipboard.writeText(result.copyText ?? "")}
          >
            Copy All to Clipboard
          </button>
        </details>
      </div>
    );
  }

  return null;
}

function CopyBlock({ label, count, text }: { label: string; count: number; text: string }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="rounded-lg border border-[var(--border)] p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold">
          {label} <span className="text-[var(--muted)] font-normal">({count})</span>
        </span>
        <button className="btn btn-secondary" style={{ padding: "3px 10px", fontSize: 12 }} onClick={copy}>
          {copied ? "Copied ✓" : "Copy"}
        </button>
      </div>
      <textarea className="input font-mono text-xs" rows={Math.min(8, Math.max(3, count + 1))} readOnly value={text} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card 3 — Canva Design (which design is connected, edit + sync)
// ---------------------------------------------------------------------------

function DesignCard({
  connection,
  connected,
  design,
}: {
  connection: CanvaConnection;
  connected: boolean;
  design: CanvaDesign | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [manualUrl, setManualUrl] = useState("");
  const [manualError, setManualError] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<SyncFromCanvaResult | null>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [changeOpen, setChangeOpen] = useState(false);
  const [templates, setTemplates] = useState<{ id: string; title: string }[] | null>(null);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [mappingOpen, setMappingOpen] = useState(false);
  const [mappingDraft, setMappingDraft] = useState<Record<PrayerBucket, string>>(() =>
    Object.keys(connection.field_mapping).length > 0
      ? invertMapping(connection.field_mapping)
      : invertMapping(DEFAULT_FIELD_MAPPING)
  );

  const hasDesign = Boolean(connection.design_id);

  const handleManualConnect = () => {
    setManualError(null);
    const fd = new FormData();
    fd.set("canva_url", manualUrl);
    startTransition(() => {
      connectManualTemplateAction(fd).then((res) => {
        if (res.error) setManualError(res.error);
        else {
          setManualUrl("");
          setChangeOpen(false);
        }
      });
    });
  };

  const loadTemplates = () => {
    setTemplatesError(null);
    setTemplatesOpen(true);
    startTransition(() => {
      listAvailableBrandTemplatesAction().then((res) => {
        if ("error" in res) setTemplatesError(res.error);
        else setTemplates(res);
      });
    });
  };

  const saveMapping = () => {
    const fieldMapping: Record<string, string> = {};
    for (const bucket of BUCKETS) {
      const field = mappingDraft[bucket]?.trim();
      if (field) fieldMapping[field] = bucket;
    }
    startTransition(() => updateFieldMappingAction(fieldMapping));
  };

  const handleEditInCanva = () => {
    setEditError(null);
    startTransition(() => {
      getEditInCanvaUrlAction().then((res) => {
        if (res.error) setEditError(res.error);
        else if (res.editUrl) window.open(res.editUrl, "_blank", "noopener,noreferrer");
      });
    });
  };

  const handleSyncFromCanva = () => {
    setSyncResult(null);
    startTransition(() => {
      syncFromCanvaAction().then(setSyncResult);
    });
  };

  return (
    <section className="card p-5">
      <div className="text-sm font-semibold mb-1">Canva Design</div>
      <p className="text-sm text-[var(--muted)] mb-3">
        {design?.title || connection.template_name || (hasDesign ? "Connected design" : "No design connected yet")}
      </p>

      {design?.thumbnailUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={design.thumbnailUrl}
          alt={design.title ?? "Canva design thumbnail"}
          className="rounded-lg border border-[var(--border)] mb-3 max-h-48 object-contain bg-white"
        />
      )}

      {!hasDesign ? (
        <div>
          <label className="block text-sm font-medium mb-1.5">Canva Design / Template URL</label>
          <div className="flex gap-2">
            <input
              className="input"
              placeholder="Paste Canva link here"
              value={manualUrl}
              onChange={(e) => setManualUrl(e.target.value)}
            />
            <button className="btn btn-secondary" disabled={isPending || !manualUrl} onClick={handleManualConnect}>
              Connect Design
            </button>
          </div>
          {manualError && <p className="text-sm text-[var(--red)] mt-1.5">{manualError}</p>}
          <p className="text-xs text-[var(--muted)] mt-2">
            The link identifies which design to use — it doesn&apos;t by itself grant edit access. Connect Canva
            above (OAuth) is what actually authorizes updates.
          </p>
          {connected && (
            <button className="btn btn-secondary mt-3" onClick={loadTemplates} disabled={isPending}>
              Or pick from my Brand Templates
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-purple" disabled={isPending || !connected} onClick={handleEditInCanva}>
              🖉 Edit in Canva
            </button>
            <button className="btn btn-secondary" disabled={isPending || !connected} onClick={handleSyncFromCanva}>
              ⭯ Sync From Canva
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => {
                setManualError(null);
                setChangeOpen((v) => !v);
              }}
            >
              Change Design
            </button>
          </div>
          {!connected && (
            <p className="text-xs text-[var(--muted)]">Connect Canva above to enable Edit and Sync.</p>
          )}

          {changeOpen && (
            <div className="pt-3 border-t border-[var(--border)]">
              <label className="block text-sm font-medium mb-1.5">Paste a new Canva design link</label>
              <div className="flex gap-2">
                <input
                  className="input"
                  placeholder="Paste Canva link here"
                  value={manualUrl}
                  onChange={(e) => setManualUrl(e.target.value)}
                />
                <button className="btn btn-secondary" disabled={isPending || !manualUrl} onClick={handleManualConnect}>
                  Connect
                </button>
              </div>
              {manualError && <p className="text-sm text-[var(--red)] mt-1.5">{manualError}</p>}
              <p className="text-xs text-[var(--muted)] mt-2">
                This replaces the currently connected design (&quot;{design?.title || connection.template_name || "current design"}&quot;)
                with whatever this new link points to.
              </p>
              {connected && (
                <button className="btn btn-secondary mt-2" onClick={loadTemplates} disabled={isPending}>
                  Or pick from my Brand Templates instead
                </button>
              )}
            </div>
          )}
          {editError && <p className="text-sm text-[var(--red)]">{editError}</p>}

          <div className="text-xs text-[var(--muted)]">
            {connection.last_synced_at && <div>Last updated via this app: {formatRelative(connection.last_synced_at)}</div>}
            {design?.updatedAt && <div>Last modified in Canva: {formatRelative(design.updatedAt)}</div>}
          </div>

          {syncResult && <SyncResultPanel result={syncResult} />}
        </div>
      )}

      {templatesOpen && (
        <div className="mt-4 pt-4 border-t border-[var(--border)]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Your Brand Templates</span>
            <button className="btn btn-ghost" onClick={() => setTemplatesOpen(false)}>
              Close
            </button>
          </div>
          {templatesError && <p className="text-sm text-[var(--red)]">{templatesError}</p>}
          {!templates && !templatesError && <p className="text-sm text-[var(--muted)]">Loading…</p>}
          {templates && (
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {templates.length === 0 && (
                <p className="text-sm text-[var(--muted)]">
                  No Brand Templates found. Autofill requires a Canva Enterprise organization with at least one
                  Brand Template. You can still paste a regular design link above to use Edit in Canva and
                  Update Canva&apos;s prepared-text fallback.
                </p>
              )}
              {templates.map((t) => (
                <button
                  key={t.id}
                  className="btn btn-secondary w-full justify-start"
                  onClick={() =>
                    startTransition(() => {
                      selectBrandTemplateAction(t.id, t.title).then(() => setTemplatesOpen(false));
                    })
                  }
                >
                  {t.title}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {hasDesign && (
        <div className="mt-4 pt-4 border-t border-[var(--border)]">
          <button className="btn btn-ghost text-xs" onClick={() => setMappingOpen((v) => !v)}>
            {mappingOpen ? "Hide" : "Show"} template field mapping
          </button>
          {mappingOpen && (
            <div className="mt-3">
              <p className="text-xs text-[var(--muted)] mb-2">
                Match each prayer category to the field name in your Canva template. Only used when this design
                is a Brand Template Autofill can update.
              </p>
              <div className="space-y-2">
                {BUCKETS.map((bucket) => (
                  <div key={bucket} className="grid grid-cols-2 gap-2 items-center">
                    <span className="text-sm">{BUCKET_LABELS[bucket]}</span>
                    <input
                      className="input"
                      placeholder={`${bucket}_PRAYERS`}
                      value={mappingDraft[bucket]}
                      onChange={(e) => setMappingDraft({ ...mappingDraft, [bucket]: e.target.value })}
                    />
                  </div>
                ))}
              </div>
              <button className="btn btn-secondary mt-3" disabled={isPending} onClick={saveMapping}>
                Save Field Mapping
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function SyncResultPanel({ result }: { result: SyncFromCanvaResult }) {
  if (result.error) {
    return (
      <div className="rounded-lg p-3 text-sm" style={{ background: "var(--red-soft)", color: "var(--red)" }}>
        {result.error}
      </div>
    );
  }

  return (
    <div className="rounded-lg p-3 space-y-2" style={{ background: "var(--amber-soft)" }}>
      <p className="text-xs" style={{ color: "var(--amber)" }}>
        {result.limitationNote}
      </p>
      <div className="text-sm space-y-0.5">
        {result.title && <div>Title: {result.title}</div>}
        {result.pageCount != null && <div>Pages: {result.pageCount}</div>}
        {result.updatedAt && <div>Last modified in Canva: {formatDate(result.updatedAt)}</div>}
      </div>
      {result.viewUrl && (
        <a href={result.viewUrl} target="_blank" rel="noreferrer" className="btn btn-secondary">
          View in Canva
        </a>
      )}
    </div>
  );
}
