"use client";

import { useMemo, useState, useTransition, useCallback, useEffect, useRef } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import type { Prayer } from "@/types/prayer";
import { needsReview, daysSinceUpdate } from "@/lib/needsReview";
import { formatDate, formatRelative } from "@/lib/format";
import StatusBadge, { NeedsReviewBadge } from "@/components/StatusBadge";
import {
  updatePrayerAction,
  markAnsweredAction,
  archivePrayerAction,
  reactivatePrayerAction,
  deletePrayerAction,
} from "@/app/prayers/actions";
import type { PrayerFilters } from "@/lib/prayers";
import type { PrayerListCounts } from "@/lib/prayers";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

interface Props {
  prayers: Prayer[];
  total: number;
  page: number;
  pageSize: number;
  options: { years: number[]; categories: string[]; ministries: string[] };
  counts: PrayerListCounts;
  reviewThresholdDays: number;
  currentFilters: PrayerFilters & { sort: string };
  /** When true, this list is rendered on /archive: hide the Archive action, show Reactivate. */
  archiveView?: boolean;
}

export default function PrayerListClient({
  prayers,
  total,
  page,
  pageSize,
  options,
  counts,
  reviewThresholdDays,
  currentFilters,
  archiveView = false,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [searchValue, setSearchValue] = useState(currentFilters.search ?? "");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setParam = useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value === null || value === "") params.delete(key);
      else params.set(key, value);
      if (key !== "page") params.delete("page");
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams]
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (searchValue !== (currentFilters.search ?? "")) setParam("q", searchValue || null);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchValue]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelected((prev) => (prev.size === prayers.length ? new Set() : new Set(prayers.map((p) => p.id))));
  };

  const goToCanva = () => {
    const params = new URLSearchParams(searchParams.toString());
    if (selected.size > 0) {
      params.set("ids", Array.from(selected).join(","));
    }
    router.push(`/canva?${params.toString()}`);
  };

  const heading = archiveView ? "Archive" : "Prayer List";

  return (
    <div className="p-4 md:p-8 max-w-[1400px] mx-auto">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="font-[family-name:var(--font-app-serif)] text-2xl md:text-3xl font-semibold text-[var(--accent-strong)]">
            {heading}
          </h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            {archiveView
              ? "No longer active, kept for history — searchable any time."
              : `${counts.active} active · ${counts.needsReview} need review · ${counts.answered} answered`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!archiveView && (
            <a href="/prayers/add" className="btn btn-primary">
              ➕ Add Prayer
            </a>
          )}
          {!archiveView && (
            <button onClick={goToCanva} className="btn btn-purple">
              🎨 Update Canva{selected.size > 0 ? ` (${selected.size})` : ""}
            </button>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          type="search"
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
          placeholder="Search names, prayers, requesters…"
          className="input max-w-md"
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <select
          className="input w-auto"
          value={currentFilters.year ?? ""}
          onChange={(e) => setParam("year", e.target.value || null)}
        >
          <option value="">All years</option>
          {options.years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>

        <select
          className="input w-auto"
          value={currentFilters.month ?? ""}
          onChange={(e) => setParam("month", e.target.value || null)}
        >
          <option value="">All months</option>
          {MONTHS.map((m, i) => (
            <option key={m} value={i + 1}>
              {m}
            </option>
          ))}
        </select>

        {!archiveView && (
          <select
            className="input w-auto"
            value={currentFilters.status ?? ""}
            onChange={(e) => setParam("status", e.target.value || null)}
          >
            <option value="">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="ANSWERED">Answered</option>
            <option value="ARCHIVED">Archived</option>
          </select>
        )}

        <select
          className="input w-auto"
          value={currentFilters.category ?? ""}
          onChange={(e) => setParam("category", e.target.value || null)}
        >
          <option value="">All categories</option>
          {options.categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <select
          className="input w-auto"
          value={currentFilters.ministry ?? ""}
          onChange={(e) => setParam("ministry", e.target.value || null)}
        >
          <option value="">All ministries</option>
          {options.ministries.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>

        <select
          className="input w-auto"
          value={currentFilters.sort}
          onChange={(e) => setParam("sort", e.target.value)}
        >
          <option value="newest">Sort: Newest</option>
          <option value="oldest">Sort: Oldest</option>
          <option value="name">Sort: Name A–Z</option>
          <option value="last_updated">Sort: Last Updated</option>
          <option value="status">Sort: Status</option>
        </select>

        {!archiveView && (
          <button
            onClick={() => setParam("review", currentFilters.needsReviewOnly ? null : "1")}
            className={`btn ${currentFilters.needsReviewOnly ? "btn-primary" : "btn-secondary"}`}
          >
            ⚠️ Needs Review ({counts.needsReview})
          </button>
        )}

        {(currentFilters.search || currentFilters.year || currentFilters.month || currentFilters.status || currentFilters.category || currentFilters.ministry || currentFilters.needsReviewOnly) && (
          <button onClick={() => router.push(pathname)} className="btn btn-ghost">
            Clear filters
          </button>
        )}
      </div>

      {/* Table */}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm min-w-[1100px]">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-[var(--muted)] border-b border-[var(--border)]">
              <th className="p-3 w-8">
                <input
                  type="checkbox"
                  checked={prayers.length > 0 && selected.size === prayers.length}
                  onChange={toggleSelectAll}
                />
              </th>
              <th className="p-3 w-16">Year</th>
              <th className="p-3 min-w-[140px]">Name / Family</th>
              <th className="p-3 min-w-[260px]">Prayer Request</th>
              <th className="p-3 min-w-[110px]">Requested By</th>
              <th className="p-3 min-w-[160px]">Category</th>
              <th className="p-3 min-w-[110px]">Ministry</th>
              <th className="p-3 min-w-[110px]">Last Updated</th>
              <th className="p-3 min-w-[130px]">Status</th>
              <th className="p-3 min-w-[220px]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {prayers.length === 0 && (
              <tr>
                <td colSpan={10} className="p-8 text-center text-[var(--muted)]">
                  No prayers found. {!archiveView && "Try clearing filters, or add a new prayer."}
                </td>
              </tr>
            )}
            {prayers.map((prayer) => (
              <PrayerRow
                key={prayer.id}
                prayer={prayer}
                selected={selected.has(prayer.id)}
                onToggleSelect={() => toggleSelect(prayer.id)}
                editing={editingId === prayer.id}
                onStartEdit={() => setEditingId(prayer.id)}
                onStopEdit={() => setEditingId(null)}
                reviewThresholdDays={reviewThresholdDays}
                archiveView={archiveView}
                isPending={isPending}
                startTransition={startTransition}
                categories={options.categories}
                ministries={options.ministries}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between mt-4 text-sm text-[var(--muted)]">
        <span>
          Showing {prayers.length === 0 ? 0 : (page - 1) * pageSize + 1}–{(page - 1) * pageSize + prayers.length} of{" "}
          {total} prayers
        </span>
        <div className="flex gap-2">
          <button
            className="btn btn-secondary"
            disabled={page <= 1}
            onClick={() => setParam("page", String(page - 1))}
          >
            ← Prev
          </button>
          <span className="px-2 py-1.5">
            Page {page} of {totalPages}
          </span>
          <button
            className="btn btn-secondary"
            disabled={page >= totalPages}
            onClick={() => setParam("page", String(page + 1))}
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}

function PrayerRow({
  prayer,
  selected,
  onToggleSelect,
  editing,
  onStartEdit,
  onStopEdit,
  reviewThresholdDays,
  archiveView,
  isPending,
  startTransition,
  categories,
  ministries,
}: {
  prayer: Prayer;
  selected: boolean;
  onToggleSelect: () => void;
  editing: boolean;
  onStartEdit: () => void;
  onStopEdit: () => void;
  reviewThresholdDays: number;
  archiveView: boolean;
  isPending: boolean;
  startTransition: (fn: () => void) => void;
  categories: string[];
  ministries: string[];
}) {
  const [draft, setDraft] = useState(prayer);

  const flagged = useMemo(() => needsReview(prayer, reviewThresholdDays), [prayer, reviewThresholdDays]);
  const days = useMemo(() => daysSinceUpdate(prayer), [prayer]);

  const save = () => {
    startTransition(() => {
      updatePrayerAction(prayer.id, {
        year: draft.year,
        name: draft.name,
        prayer_request: draft.prayer_request,
        requested_by: draft.requested_by,
        category: draft.category,
        assigned_ministry: draft.assigned_ministry,
        notes: draft.notes,
      }).then(() => onStopEdit());
    });
  };

  if (editing) {
    return (
      <tr className="border-b border-[var(--border)] bg-[var(--accent-soft)]/40 align-top">
        <td className="p-2"></td>
        <td className="p-2">
          <input
            type="number"
            className="input"
            value={draft.year}
            onChange={(e) => setDraft({ ...draft, year: Number(e.target.value) })}
          />
        </td>
        <td className="p-2">
          <input
            className="input"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </td>
        <td className="p-2">
          <textarea
            className="input"
            rows={3}
            value={draft.prayer_request}
            onChange={(e) => setDraft({ ...draft, prayer_request: e.target.value })}
          />
        </td>
        <td className="p-2">
          <input
            className="input"
            value={draft.requested_by ?? ""}
            onChange={(e) => setDraft({ ...draft, requested_by: e.target.value })}
          />
        </td>
        <td className="p-2">
          <input
            className="input"
            list="category-options"
            value={draft.category}
            onChange={(e) => setDraft({ ...draft, category: e.target.value })}
          />
          <datalist id="category-options">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </td>
        <td className="p-2">
          <input
            className="input"
            list="ministry-options"
            value={draft.assigned_ministry ?? ""}
            onChange={(e) => setDraft({ ...draft, assigned_ministry: e.target.value })}
          />
          <datalist id="ministry-options">
            {ministries.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </td>
        <td className="p-2 text-xs text-[var(--muted)]">{formatRelative(prayer.last_updated)}</td>
        <td className="p-2">
          <StatusBadge status={prayer.status} />
        </td>
        <td className="p-2">
          <div className="flex gap-1.5">
            <button className="btn btn-primary" disabled={isPending} onClick={save}>
              Save
            </button>
            <button className="btn btn-secondary" onClick={onStopEdit}>
              Cancel
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-[var(--border)] hover:bg-[var(--accent-soft)]/30 align-top">
      <td className="p-3">
        <input type="checkbox" checked={selected} onChange={onToggleSelect} />
      </td>
      <td className="p-3 text-[var(--muted)]">{prayer.year}</td>
      <td className="p-3 font-medium">{prayer.name}</td>
      <td className="p-3 max-w-[360px]">
        <p className="line-clamp-3">{prayer.prayer_request}</p>
      </td>
      <td className="p-3 text-[var(--muted)]">{prayer.requested_by ?? "—"}</td>
      <td className="p-3 text-[var(--muted)]">{prayer.category}</td>
      <td className="p-3 text-[var(--muted)]">{prayer.assigned_ministry ?? "—"}</td>
      <td className="p-3">
        <div className="text-[var(--muted)]">{formatDate(prayer.last_updated)}</div>
        {flagged && (
          <div className="mt-1">
            <NeedsReviewBadge days={days} />
          </div>
        )}
      </td>
      <td className="p-3">
        <StatusBadge status={prayer.status} />
        {prayer.status === "ANSWERED" && prayer.date_answered && (
          <div className="text-xs text-[var(--muted)] mt-1">{formatDate(prayer.date_answered)}</div>
        )}
      </td>
      <td className="p-3">
        <div className="flex flex-wrap gap-1.5">
          <button
            className="btn btn-ghost"
            onClick={() => {
              setDraft(prayer);
              onStartEdit();
            }}
          >
            Edit
          </button>
          {!archiveView && prayer.status !== "ANSWERED" && (
            <button
              className="btn btn-ghost"
              disabled={isPending}
              onClick={() => startTransition(() => markAnsweredAction(prayer.id))}
            >
              Mark Answered
            </button>
          )}
          {!archiveView && prayer.status !== "ARCHIVED" && (
            <button
              className="btn btn-ghost"
              disabled={isPending}
              onClick={() => startTransition(() => archivePrayerAction(prayer.id))}
            >
              Archive
            </button>
          )}
          {archiveView && (
            <button
              className="btn btn-ghost"
              disabled={isPending}
              onClick={() => startTransition(() => reactivatePrayerAction(prayer.id))}
            >
              Reactivate
            </button>
          )}
          <button
            className="btn btn-danger"
            disabled={isPending}
            onClick={() => {
              if (confirm(`Delete the prayer request for ${prayer.name}? This cannot be undone.`)) {
                startTransition(() => deletePrayerAction(prayer.id));
              }
            }}
          >
            Delete
          </button>
        </div>
      </td>
    </tr>
  );
}
