"use client";

import { useState, useTransition } from "react";
import type { CanvaConnection } from "@/types/prayer";
import type { PrayerFilters } from "@/lib/prayers";
import { BUCKET_LABELS, DEFAULT_FIELD_MAPPING, type PrayerBucket } from "@/lib/canva/mapping";
import {
  connectManualTemplateAction,
  disconnectCanvaAction,
  updateFieldMappingAction,
  updateCanvaAction,
  listAvailableBrandTemplatesAction,
  selectBrandTemplateAction,
  type UpdateCanvaResult,
} from "@/app/canva/actions";
import { formatDate } from "@/lib/format";

interface Props {
  connection: CanvaConnection;
  summary: { total: number; byBucket: Record<string, number> };
  selection: { ids?: string[]; filters?: PrayerFilters; hasFilters: boolean };
  urlMessage: { error?: string; connected: boolean };
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

export default function CanvaClient({ connection, summary, selection, urlMessage }: Props) {
  const [isPending, startTransition] = useTransition();
  const [manualUrl, setManualUrl] = useState("");
  const [manualError, setManualError] = useState<string | null>(null);
  const [mappingDraft, setMappingDraft] = useState<Record<PrayerBucket, string>>(() =>
    Object.keys(connection.field_mapping).length > 0
      ? invertMapping(connection.field_mapping)
      : invertMapping(DEFAULT_FIELD_MAPPING)
  );
  const [templates, setTemplates] = useState<{ id: string; title: string }[] | null>(null);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [result, setResult] = useState<UpdateCanvaResult | null>(null);

  const connected = connection.connection_status === "CONNECTED";

  const scopeLabel = selection.ids && selection.ids.length > 0
    ? `${selection.ids.length} selected prayer${selection.ids.length === 1 ? "" : "s"}`
    : selection.hasFilters
      ? "current filtered results"
      : "all active prayers";

  const handleManualConnect = () => {
    setManualError(null);
    const fd = new FormData();
    fd.set("canva_url", manualUrl);
    startTransition(() => {
      connectManualTemplateAction(fd).then((res) => {
        if (res.error) setManualError(res.error);
        else setManualUrl("");
      });
    });
  };

  const loadTemplates = () => {
    setTemplatesError(null);
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
    startTransition(() => {
      updateFieldMappingAction(fieldMapping);
    });
  };

  const runUpdate = () => {
    startTransition(() => {
      updateCanvaAction({ ids: selection.ids, filters: selection.filters }).then((res) => {
        setResult(res);
        setConfirmOpen(false);
      });
    });
  };

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-app-serif)] text-2xl md:text-3xl font-semibold text-[var(--accent-strong)]">
          🎨 Canva
        </h1>
        <p className="text-sm text-[var(--muted)] mt-1">
          Keep your published prayer list graphic in sync with the database — no copy-pasting.
        </p>
      </div>

      {urlMessage.error && (
        <div className="card p-4 border-[var(--red)]" style={{ background: "var(--red-soft)" }}>
          <p className="text-sm text-[var(--red)]">{urlMessage.error}</p>
        </div>
      )}
      {urlMessage.connected && (
        <div className="card p-4" style={{ background: "var(--green-soft)" }}>
          <p className="text-sm text-[var(--green)]">🟢 Canva connected successfully.</p>
        </div>
      )}

      {/* Connection status */}
      <section className="card p-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="text-sm font-semibold mb-1">Canva Connection</div>
            <div className="text-sm">
              {connected ? (
                <span style={{ color: "var(--green)" }}>🟢 Canva Connected</span>
              ) : (
                <span style={{ color: "var(--red)" }}>🔴 Not Connected</span>
              )}
            </div>
          </div>
          {!connected ? (
            <a href="/api/canva/oauth/start" className="btn btn-purple">
              + Connect Canva
            </a>
          ) : (
            <button
              className="btn btn-secondary"
              disabled={isPending}
              onClick={() => startTransition(() => disconnectCanvaAction())}
            >
              Disconnect Canva
            </button>
          )}
        </div>

        {connected && (
          <div className="mt-4 pt-4 border-t border-[var(--border)]">
            <div className="text-sm text-[var(--muted)]">Connected Template</div>
            <div className="font-medium">Prayer List — {connection.template_name ?? "Untitled template"}</div>
            <div className="flex flex-wrap gap-2 mt-3">
              {connection.design_id && (
                <a
                  href={`https://www.canva.com/design/${connection.design_id}/view`}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-secondary"
                >
                  Open in Canva
                </a>
              )}
              <button className="btn btn-secondary" onClick={loadTemplates} disabled={isPending}>
                Change Template
              </button>
            </div>

            {templatesError && <p className="text-sm text-[var(--red)] mt-2">{templatesError}</p>}
            {templates && (
              <div className="mt-3 space-y-1.5 max-h-48 overflow-y-auto">
                {templates.length === 0 && (
                  <p className="text-sm text-[var(--muted)]">
                    No Brand Templates found. Autofill requires a Canva Enterprise organization with at least
                    one Brand Template — see Settings for details on this limitation.
                  </p>
                )}
                {templates.map((t) => (
                  <button
                    key={t.id}
                    className="btn btn-secondary w-full justify-start"
                    onClick={() => startTransition(() => selectBrandTemplateAction(t.id, t.title))}
                  >
                    {t.title}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {!connected && (
          <div className="mt-4 pt-4 border-t border-[var(--border)]">
            <label className="block text-sm font-medium mb-1.5">Canva Design / Template URL</label>
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
              A pasted link alone doesn&apos;t grant edit access — it only lets the admin jump to the design with
              &ldquo;Open in Canva&rdquo;. For automatic updates, use <strong>+ Connect Canva</strong> above to sign in
              with Canva&apos;s official OAuth flow, which is required for the Update Canva button to work.
            </p>
          </div>
        )}
      </section>

      {/* Field mapping */}
      {connected && connection.template_id && (
        <section className="card p-5">
          <div className="text-sm font-semibold mb-1">Template Fields</div>
          <p className="text-xs text-[var(--muted)] mb-3">
            Match each prayer category to the field name in your Canva template. Leave blank to skip a category.
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
        </section>
      )}

      {/* Update Canva */}
      <section className="card p-5">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
          <div>
            <div className="text-sm font-semibold">Update Canva Prayer List</div>
            <div className="text-xs text-[var(--muted)] mt-0.5">
              Publishing: <strong>{scopeLabel}</strong>
              {connection.last_synced_at && <> · Last update: {formatDate(connection.last_synced_at)}</>}
            </div>
          </div>
          <button className="btn btn-purple" onClick={() => setConfirmOpen(true)}>
            🟣 Update Canva
          </button>
        </div>

        <div className="text-sm text-[var(--muted)]">Active prayers: {summary.total}</div>
        <ul className="text-sm text-[var(--muted)] mt-1 space-y-0.5">
          {Object.entries(summary.byBucket).map(([label, count]) => (
            <li key={label}>
              {label}: {count}
            </li>
          ))}
        </ul>

        {confirmOpen && (
          <div className="mt-4 pt-4 border-t border-[var(--border)]">
            <p className="text-sm mb-3">
              This will publish <strong>{scopeLabel}</strong> ({summary.total} prayers) to{" "}
              {connected ? "your connected Canva design" : "a copyable text export (Canva isn't connected yet)"}.
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

        {result && <ResultPanel result={result} />}
      </section>
    </div>
  );
}

function ResultPanel({ result }: { result: UpdateCanvaResult }) {
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

  if (result.mode === "copy" && result.copyText) {
    return (
      <div className="mt-4 pt-4 border-t border-[var(--border)]">
        <p className="text-sm mb-2" style={{ color: "var(--amber)" }}>
          🟡 Canva not connected — here&apos;s a clean, ready-to-paste copy instead.
        </p>
        <textarea className="input font-mono text-xs" rows={10} readOnly value={result.copyText} />
        <button
          className="btn btn-secondary mt-2"
          onClick={() => navigator.clipboard.writeText(result.copyText ?? "")}
        >
          Copy to Clipboard
        </button>
      </div>
    );
  }

  return null;
}
