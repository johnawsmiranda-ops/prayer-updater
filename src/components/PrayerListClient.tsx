"use client";

import { useMemo, useState, useTransition, useCallback, useEffect, useRef } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import type { Prayer } from "@/types/prayer";
import { needsReview, daysSinceUpdate } from "@/lib/needsReview";
import { formatDate, formatRelative } from "@/lib/format";
import { categoryBadgeStyle, ministryColor } from "@/lib/badgeColors";
import { CANONICAL_MINISTRIES } from "@/lib/ministries";
import ActionNotice from "@/components/ActionNotice";
import {
  updatePrayerAction,
  markAnsweredAction,
  archivePrayerAction,
  reactivatePrayerAction,
  deletePrayerAction,
  bulkMarkAnsweredAction,
  bulkArchivePrayerAction,
  bulkReactivatePrayerAction,
  bulkDeletePrayerAction,
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
  /** Only present on the main /prayers page — drives the Canva banner. */
  canva?: { connected: boolean; lastSyncedAt: string | null };
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
  canva,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [searchValue, setSearchValue] = useState(currentFilters.search ?? "");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "grid">("list");
  const [notice, setNotice] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const notify = (message: string) => setNotice(message);

  const setParam = useCallback(
    (key: string, value: string | null, opts: { resetPage?: boolean } = { resetPage: true }) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value === null || value === "") params.delete(key);
      else params.set(key, value);
      if (opts.resetPage !== false && key !== "page") params.delete("page");
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

  const clearSelectionAnd = (fn: () => void) => {
    fn();
    setSelected(new Set());
  };

  const goToCanva = () => {
    const params = new URLSearchParams(searchParams.toString());
    if (selected.size > 0) params.set("ids", Array.from(selected).join(","));
    router.push(`/canva?${params.toString()}`);
  };

  const hasActiveFilters = Boolean(
    currentFilters.search ||
      currentFilters.year ||
      currentFilters.month ||
      currentFilters.status ||
      currentFilters.category ||
      currentFilters.ministry ||
      currentFilters.needsReviewOnly
  );

  return (
    <div>
      {!archiveView && (
        <HeroHeader />
      )}

      <div className="p-4 md:p-8 max-w-[1400px] mx-auto">
        {!archiveView && (
          <StatsRow counts={counts} currentStatus={currentFilters.status} needsReviewOnly={currentFilters.needsReviewOnly} canva={canva} setParam={setParam} />
        )}

        {archiveView && (
          <div className="mb-6">
            <h1 className="font-[family-name:var(--font-app-serif)] text-2xl md:text-3xl font-semibold text-[var(--accent-strong)]">
              Archive
            </h1>
            <p className="text-sm text-[var(--muted)] mt-1">
              No longer active, kept for history — searchable any time.
            </p>
          </div>
        )}

        {/* Search */}
        <div className="mb-3">
          <input
            type="search"
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            placeholder="Search names, prayers, requesters, or keywords…"
            className="input"
          />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <IconSelect icon="📅" value={currentFilters.year ? String(currentFilters.year) : ""} onChange={(v) => setParam("year", v || null)}>
            <option value="">All Years</option>
            {options.years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </IconSelect>

          <IconSelect icon="🗓" value={currentFilters.month ? String(currentFilters.month) : ""} onChange={(v) => setParam("month", v || null)}>
            <option value="">All Months</option>
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </IconSelect>

          <IconSelect icon="🏷" value={currentFilters.category ?? ""} onChange={(v) => setParam("category", v || null)}>
            <option value="">All Categories</option>
            {options.categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </IconSelect>

          <IconSelect icon="👥" value={currentFilters.ministry ?? ""} onChange={(v) => setParam("ministry", v || null)}>
            <option value="">All Ministries</option>
            {options.ministries.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </IconSelect>

          {!archiveView && (
            <IconSelect icon="●" value={currentFilters.status ?? ""} onChange={(v) => setParam("status", v || null)}>
              <option value="">All Statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="ANSWERED">Answered</option>
              <option value="ARCHIVED">Archived</option>
            </IconSelect>
          )}

          {hasActiveFilters && (
            <button onClick={() => router.push(pathname)} className="text-sm font-medium text-[var(--accent)] hover:underline">
              Reset
            </button>
          )}

          <div className="flex-1" />

          {!archiveView && (
            <button
              onClick={() => setParam("review", currentFilters.needsReviewOnly ? null : "1")}
              className={`btn ${currentFilters.needsReviewOnly ? "btn-primary" : "btn-secondary"}`}
            >
              ⚠️ Needs Review ({counts.needsReview})
            </button>
          )}
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {!archiveView && (
            <a href="/prayers/add" className="btn btn-primary">
              + Add Prayer
            </a>
          )}

          <button
            className="btn btn-secondary"
            disabled={selected.size !== 1}
            onClick={() => setEditingId(Array.from(selected)[0])}
          >
            ✎ Edit
          </button>

          {!archiveView && (
            <button
              className="btn btn-secondary"
              disabled={selected.size === 0 || isPending}
              onClick={() => {
                const count = selected.size;
                startTransition(() => {
                  bulkMarkAnsweredAction(Array.from(selected)).then(() => {
                    clearSelectionAnd(() => {});
                    notify(`${count} prayer${count === 1 ? "" : "s"} marked as answered.`);
                  });
                });
              }}
            >
              ✓ Mark as Answered
            </button>
          )}

          {!archiveView ? (
            <button
              className="btn btn-secondary"
              disabled={selected.size === 0 || isPending}
              onClick={() => {
                const count = selected.size;
                startTransition(() => {
                  bulkArchivePrayerAction(Array.from(selected)).then(() => {
                    clearSelectionAnd(() => {});
                    notify(`${count} prayer${count === 1 ? "" : "s"} archived.`);
                  });
                });
              }}
            >
              🗄 Archive
            </button>
          ) : (
            <button
              className="btn btn-secondary"
              disabled={selected.size === 0 || isPending}
              onClick={() => {
                const count = selected.size;
                startTransition(() => {
                  bulkReactivatePrayerAction(Array.from(selected)).then(() => {
                    clearSelectionAnd(() => {});
                    notify(`${count} prayer${count === 1 ? "" : "s"} reactivated.`);
                  });
                });
              }}
            >
              ↺ Reactivate
            </button>
          )}

          <button
            className="btn btn-danger"
            disabled={selected.size === 0 || isPending}
            onClick={() => {
              const count = selected.size;
              if (confirm(`Delete ${count} prayer${count === 1 ? "" : "s"}? This cannot be undone.`)) {
                startTransition(() => {
                  bulkDeletePrayerAction(Array.from(selected)).then(() => {
                    clearSelectionAnd(() => {});
                    notify(`${count} prayer${count === 1 ? "" : "s"} deleted.`);
                  });
                });
              }
            }}
          >
            🗑 Delete
          </button>

          {!archiveView && (
            <button onClick={goToCanva} className="btn btn-purple">
              🎨 Update Canva{selected.size > 0 ? ` (${selected.size})` : ""}
            </button>
          )}

          <div className="flex-1" />

          <IconSelect icon="⇅" value={currentFilters.sort} onChange={(v) => setParam("sort", v, { resetPage: false })}>
            <option value="newest">Sort: Newest</option>
            <option value="oldest">Sort: Oldest</option>
            <option value="name">Sort: Name A–Z</option>
            <option value="last_updated">Sort: Last Updated</option>
            <option value="status">Sort: Status</option>
          </IconSelect>

          <div className="flex rounded-lg border border-[var(--border)] overflow-hidden">
            <button
              className="px-2.5 py-1.5"
              style={{ background: view === "list" ? "var(--accent-soft)" : "transparent" }}
              onClick={() => setView("list")}
              aria-label="List view"
              title="List view"
            >
              ☰
            </button>
            <button
              className="px-2.5 py-1.5 border-l border-[var(--border)]"
              style={{ background: view === "grid" ? "var(--accent-soft)" : "transparent" }}
              onClick={() => setView("grid")}
              aria-label="Grid view"
              title="Grid view"
            >
              ▦
            </button>
          </div>
        </div>

        {/* Content */}
        {view === "list" ? (
          <PrayerTable
            prayers={prayers}
            selected={selected}
            toggleSelect={toggleSelect}
            toggleSelectAll={toggleSelectAll}
            editingId={editingId}
            setEditingId={setEditingId}
            reviewThresholdDays={reviewThresholdDays}
            archiveView={archiveView}
            isPending={isPending}
            startTransition={startTransition}
            categories={options.categories}
            onNotify={notify}
          />
        ) : (
          <PrayerGrid
            prayers={prayers}
            selected={selected}
            toggleSelect={toggleSelect}
            reviewThresholdDays={reviewThresholdDays}
          />
        )}

        {/* Pagination */}
        <div className="flex flex-wrap items-center justify-between gap-3 mt-4 text-sm text-[var(--muted)]">
          <span>
            Showing {prayers.length === 0 ? 0 : (page - 1) * pageSize + 1}–{(page - 1) * pageSize + prayers.length} of{" "}
            {total} prayers
          </span>
          <div className="flex items-center gap-3">
            <PageNumbers page={page} totalPages={totalPages} onGo={(p) => setParam("page", String(p), { resetPage: false })} />
            <IconSelect icon="" value={String(pageSize)} onChange={(v) => setParam("pageSize", v)} label="Rows per page:">
              <option value="10">10</option>
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </IconSelect>
          </div>
        </div>
      </div>

      {notice && <ActionNotice message={notice} onClose={() => setNotice(null)} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hero header + stat cards
// ---------------------------------------------------------------------------

function HeroHeader() {
  return (
    <div
      className="relative overflow-hidden border-b border-[var(--border)]"
      style={{
        background:
          "linear-gradient(180deg, #fdf3e3 0%, #f7e3c9 35%, #eccfa8 65%, #d9b487 100%)",
      }}
    >
      <svg
        className="absolute bottom-0 left-0 w-full h-24 opacity-40"
        viewBox="0 0 1200 200"
        preserveAspectRatio="none"
        aria-hidden
      >
        <path d="M0,180 L150,90 L300,150 L480,60 L650,140 L820,80 L1000,150 L1200,100 L1200,200 L0,200 Z" fill="#a97c50" />
        <path d="M0,200 L200,140 L400,190 L600,120 L800,180 L1000,130 L1200,190 L1200,200 Z" fill="#8a6238" opacity="0.6" />
      </svg>
      <div className="relative px-4 md:px-8 py-6 flex flex-wrap items-center justify-between gap-4 max-w-[1400px] mx-auto">
        <div className="flex items-center gap-3">
          <span className="text-4xl" aria-hidden>
            ✚
          </span>
          <div>
            <h1 className="font-[family-name:var(--font-app-serif)] text-2xl md:text-3xl font-semibold text-[var(--accent-strong)] leading-tight">
              Prayer List
            </h1>
            <div className="text-sm text-[var(--foreground)]/80">Faith Assembly of God Int&apos;l</div>
            <div className="text-xs tracking-wide text-[var(--foreground)]/60 mt-0.5">
              PRAY · BELIEVE · SEE GOD MOVE
            </div>
          </div>
        </div>

        <div className="hidden md:block text-center max-w-md">
          <p className="font-[family-name:var(--font-app-serif)] italic text-[var(--accent-strong)]">
            &ldquo;Be joyful in hope, patient in affliction, faithful in prayer.&rdquo;
          </p>
          <p className="text-xs tracking-wide text-[var(--foreground)]/60 mt-1">ROMANS 12:12</p>
        </div>

        <a href="/settings" className="flex items-center gap-2 bg-white/70 rounded-full pl-2 pr-3 py-1.5">
          <span className="w-7 h-7 rounded-full bg-[var(--accent-strong)] text-white text-xs flex items-center justify-center">
            A
          </span>
          <span className="text-sm">
            <div className="font-medium leading-tight">Admin</div>
            <div className="text-xs text-[var(--muted)] leading-tight">Church Prayer Ministry</div>
          </span>
        </a>
      </div>
    </div>
  );
}

function StatsRow({
  counts,
  currentStatus,
  needsReviewOnly,
  canva,
  setParam,
}: {
  counts: PrayerListCounts;
  currentStatus?: string;
  needsReviewOnly?: boolean;
  canva?: { connected: boolean; lastSyncedAt: string | null };
  setParam: (key: string, value: string | null) => void;
}) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 -mt-8 md:-mt-10 mb-6 relative z-10">
      <StatCard
        icon="🙏"
        iconBg="var(--green-soft)"
        value={counts.active}
        label="Active Prayers"
        sub="Currently on the list"
        active={currentStatus === "ACTIVE" && !needsReviewOnly}
        onClick={() => setParam("status", "ACTIVE")}
      />
      <StatCard
        icon="🕐"
        iconBg="var(--amber-soft)"
        value={counts.needsReview}
        label="Need Review"
        sub={`Not updated in 30+ days`}
        active={Boolean(needsReviewOnly)}
        onClick={() => setParam("review", "1")}
      />
      <StatCard
        icon="✓"
        iconBg="#dbeafe"
        value={counts.answered}
        label="Answered"
        sub="Praise God!"
        active={currentStatus === "ANSWERED"}
        onClick={() => setParam("status", "ANSWERED")}
      />
      <StatCard icon="🗄" iconBg="#e5e5e5" value={counts.archived} label="Archived" sub="Past prayers" href="/archive" />
      {canva && <CanvaBanner active={counts.active} connected={canva.connected} lastSyncedAt={canva.lastSyncedAt} />}
    </div>
  );
}

function StatCard({
  icon,
  iconBg,
  value,
  label,
  sub,
  active,
  onClick,
  href,
}: {
  icon: string;
  iconBg: string;
  value: number;
  label: string;
  sub: string;
  active?: boolean;
  onClick?: () => void;
  href?: string;
}) {
  const content = (
    <>
      <div className="flex items-center gap-3">
        <span
          className="w-11 h-11 rounded-full flex items-center justify-center text-lg shrink-0"
          style={{ background: iconBg }}
          aria-hidden
        >
          {icon}
        </span>
        <div>
          <div className="text-2xl font-semibold leading-tight">{value}</div>
        </div>
        <span className="ml-auto text-[var(--muted)]">›</span>
      </div>
      <div className="mt-2 text-sm font-medium">{label}</div>
      <div className="text-xs text-[var(--muted)]">{sub}</div>
    </>
  );

  // w-full/h-full + block-level flex column: without these, a <button> only
  // takes the width/height of its content in some browsers, leaving dead
  // zones around the icon/number where clicks land on the card but not on
  // the button itself -- that's the "sometimes not working" the whole card
  // needs to be clickable everywhere, not just directly on the text.
  const className = `card p-4 text-left w-full h-full flex flex-col cursor-pointer hover:shadow-sm transition-shadow ${active ? "ring-2" : ""}`;
  const style = active ? { borderColor: "var(--accent)" as const } : undefined;

  if (href) {
    return (
      <a href={href} className={className} style={style}>
        {content}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className} style={style}>
      {content}
    </button>
  );
}

function CanvaBanner({ active, connected, lastSyncedAt }: { active: number; connected: boolean; lastSyncedAt: string | null }) {
  return (
    <a
      href="/canva"
      className="col-span-2 md:col-span-1 rounded-xl p-4 text-white flex flex-col justify-between"
      style={{ background: "linear-gradient(135deg, #6d4c9c 0%, #4a63c9 100%)" }}
    >
      <div className="flex items-center justify-between">
        <span className="font-[family-name:var(--font-app-serif)] font-semibold italic">Canva</span>
        <span className="opacity-80">›</span>
      </div>
      <div>
        <div className="font-semibold text-sm mt-2">UPDATE CANVA</div>
        <div className="text-xs opacity-90">{active} active prayers ready</div>
      </div>
      <div className="text-[11px] opacity-80 mt-2 flex items-center justify-between">
        <span>{lastSyncedAt ? `Last updated: ${formatDate(lastSyncedAt)}` : "Not synced yet"}</span>
        <span className="flex items-center gap-1">
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: connected ? "#4ade80" : "#f87171" }}
          />
          {connected ? "Connected" : "Not connected"}
        </span>
      </div>
    </a>
  );
}

// ---------------------------------------------------------------------------
// Small shared controls
// ---------------------------------------------------------------------------

function IconSelect({
  icon,
  value,
  onChange,
  children,
  label,
}: {
  icon: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
  label?: string;
}) {
  return (
    <label className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-sm">
      {label && <span className="text-[var(--muted)] text-xs whitespace-nowrap">{label}</span>}
      {icon && <span aria-hidden>{icon}</span>}
      <select
        className="bg-transparent outline-none"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {children}
      </select>
    </label>
  );
}

function PageNumbers({ page, totalPages, onGo }: { page: number; totalPages: number; onGo: (p: number) => void }) {
  const nums: number[] = [];
  const start = Math.max(1, Math.min(page - 2, totalPages - 4));
  const end = Math.min(totalPages, Math.max(page + 2, 5));
  for (let i = Math.max(1, start); i <= end; i++) nums.push(i);

  return (
    <div className="flex items-center gap-1">
      <button className="btn btn-secondary px-2" disabled={page <= 1} onClick={() => onGo(page - 1)} aria-label="Previous page">
        ‹
      </button>
      {nums.map((n) => (
        <button
          key={n}
          onClick={() => onGo(n)}
          className="w-8 h-8 rounded-lg text-sm"
          style={
            n === page
              ? { background: "var(--accent-strong)", color: "white" }
              : { background: "var(--surface)", border: "1px solid var(--border)" }
          }
        >
          {n}
        </button>
      ))}
      <button
        className="btn btn-secondary px-2"
        disabled={page >= totalPages}
        onClick={() => onGo(page + 1)}
        aria-label="Next page"
      >
        ›
      </button>
    </div>
  );
}

function CategoryBadge({ category }: { category: string }) {
  const style = categoryBadgeStyle(category);
  return (
    <span className="badge" style={{ background: style.bg, color: style.fg }}>
      {category}
    </span>
  );
}

function StatusDot({ prayer, flagged }: { prayer: Prayer; flagged: boolean; days: number }) {
  if (flagged) {
    return (
      <span className="badge" style={{ background: "var(--amber-soft)", color: "var(--amber)" }}>
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--amber)" }} />
        Needs Review
      </span>
    );
  }
  const styles: Record<Prayer["status"], { bg: string; fg: string; label: string }> = {
    ACTIVE: { bg: "var(--green-soft)", fg: "var(--green)", label: "Active" },
    ANSWERED: { bg: "#dbeafe", fg: "#1d4ed8", label: "Answered" },
    ARCHIVED: { bg: "#eee", fg: "#666", label: "Archived" },
  };
  const s = styles[prayer.status];
  return (
    <span className="badge" style={{ background: s.bg, color: s.fg }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.fg }} />
      {s.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Table (list view)
// ---------------------------------------------------------------------------

function PrayerTable({
  prayers,
  selected,
  toggleSelect,
  toggleSelectAll,
  editingId,
  setEditingId,
  reviewThresholdDays,
  archiveView,
  isPending,
  startTransition,
  categories,
  onNotify,
}: {
  prayers: Prayer[];
  selected: Set<string>;
  toggleSelect: (id: string) => void;
  toggleSelectAll: () => void;
  editingId: string | null;
  setEditingId: (id: string | null) => void;
  reviewThresholdDays: number;
  archiveView: boolean;
  isPending: boolean;
  startTransition: (fn: () => void) => void;
  categories: string[];
  onNotify: (message: string) => void;
}) {
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm min-w-[1000px]">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-[var(--muted)] border-b border-[var(--border)]">
            <th className="p-3 w-8">
              <input
                type="checkbox"
                checked={prayers.length > 0 && selected.size === prayers.length}
                onChange={toggleSelectAll}
              />
            </th>
            <th className="p-3 min-w-[140px]">Name / Family</th>
            <th className="p-3 min-w-[280px]">Prayer Request</th>
            <th className="p-3 min-w-[140px]">Category</th>
            <th className="p-3 min-w-[100px]">Ministry</th>
            <th className="p-3 min-w-[120px]">Last Updated</th>
            <th className="p-3 min-w-[130px]">Status</th>
            <th className="p-3 w-16">Actions</th>
          </tr>
        </thead>
        <tbody>
          {prayers.length === 0 && (
            <tr>
              <td colSpan={8} className="p-8 text-center text-[var(--muted)]">
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
              categories={categories}
              onNotify={onNotify}
            />
          ))}
        </tbody>
      </table>
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
  onNotify,
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
  onNotify: (message: string) => void;
}) {
  const [draft, setDraft] = useState(prayer);
  const [menuOpen, setMenuOpen] = useState(false);

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
      }).then(() => {
        onStopEdit();
        onNotify("Prayer updated.");
      });
    });
  };

  if (editing) {
    return (
      <tr className="border-b border-[var(--border)] bg-[var(--accent-soft)]/40 align-top">
        <td className="p-2"></td>
        <td className="p-2">
          <input className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <input
            type="number"
            className="input mt-1"
            value={draft.year}
            onChange={(e) => setDraft({ ...draft, year: Number(e.target.value) })}
          />
        </td>
        <td className="p-2">
          <textarea
            className="input"
            rows={3}
            value={draft.prayer_request}
            onChange={(e) => setDraft({ ...draft, prayer_request: e.target.value })}
          />
          <input
            className="input mt-1"
            placeholder="Requested by"
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
            {CANONICAL_MINISTRIES.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </td>
        <td className="p-2 text-xs text-[var(--muted)]">{formatRelative(prayer.last_updated)}</td>
        <td className="p-2">
          <StatusDot prayer={prayer} flagged={flagged} days={days} />
        </td>
        <td className="p-2">
          <div className="flex flex-col gap-1.5">
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
      <td className="p-3 font-medium">{prayer.name}</td>
      <td className="p-3 max-w-[360px]">
        <p className="line-clamp-2">{prayer.prayer_request}</p>
      </td>
      <td className="p-3">
        <CategoryBadge category={prayer.category} />
      </td>
      <td className="p-3">
        <span style={{ color: ministryColor(prayer.assigned_ministry) }}>{prayer.assigned_ministry ?? "—"}</span>
      </td>
      <td className="p-3">
        <div>{formatDate(prayer.last_updated)}</div>
        <div className="text-xs text-[var(--muted)]">{formatRelative(prayer.last_updated)}</div>
      </td>
      <td className="p-3">
        <StatusDot prayer={prayer} flagged={flagged} days={days} />
      </td>
      <td className="p-3 relative">
        <button className="btn btn-ghost px-2" onClick={() => setMenuOpen((v) => !v)} aria-label="Row actions">
          •••
        </button>
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
            <div className="absolute right-2 top-9 z-20 card p-1.5 min-w-[160px] shadow-lg">
              <button
                className="btn btn-ghost w-full justify-start"
                onClick={() => {
                  setDraft(prayer);
                  onStartEdit();
                  setMenuOpen(false);
                }}
              >
                Edit
              </button>
              {!archiveView && prayer.status !== "ANSWERED" && (
                <button
                  className="btn btn-ghost w-full justify-start"
                  disabled={isPending}
                  onClick={() => {
                    setMenuOpen(false);
                    startTransition(() => {
                      markAnsweredAction(prayer.id).then(() => onNotify("Prayer marked as answered."));
                    });
                  }}
                >
                  Mark Answered
                </button>
              )}
              {!archiveView && prayer.status !== "ARCHIVED" && (
                <button
                  className="btn btn-ghost w-full justify-start"
                  disabled={isPending}
                  onClick={() => {
                    setMenuOpen(false);
                    startTransition(() => {
                      archivePrayerAction(prayer.id).then(() => onNotify("Prayer archived."));
                    });
                  }}
                >
                  Archive
                </button>
              )}
              {archiveView && (
                <button
                  className="btn btn-ghost w-full justify-start"
                  disabled={isPending}
                  onClick={() => {
                    setMenuOpen(false);
                    startTransition(() => {
                      reactivatePrayerAction(prayer.id).then(() => onNotify("Prayer reactivated."));
                    });
                  }}
                >
                  Reactivate
                </button>
              )}
              <button
                className="btn btn-danger w-full justify-start"
                disabled={isPending}
                onClick={() => {
                  setMenuOpen(false);
                  if (confirm(`Delete the prayer request for ${prayer.name}? This cannot be undone.`)) {
                    startTransition(() => {
                      deletePrayerAction(prayer.id).then(() => onNotify("Prayer deleted."));
                    });
                  }
                }}
              >
                Delete
              </button>
            </div>
          </>
        )}
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Grid (card) view
// ---------------------------------------------------------------------------

function PrayerGrid({
  prayers,
  selected,
  toggleSelect,
  reviewThresholdDays,
}: {
  prayers: Prayer[];
  selected: Set<string>;
  toggleSelect: (id: string) => void;
  reviewThresholdDays: number;
}) {
  if (prayers.length === 0) {
    return <div className="card p-8 text-center text-[var(--muted)]">No prayers found.</div>;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {prayers.map((prayer) => {
        const flagged = needsReview(prayer, reviewThresholdDays);
        const days = daysSinceUpdate(prayer);
        return (
          <div key={prayer.id} className="card p-4">
            <div className="flex items-start justify-between gap-2 mb-2">
              <input type="checkbox" checked={selected.has(prayer.id)} onChange={() => toggleSelect(prayer.id)} />
              <StatusDot prayer={prayer} flagged={flagged} days={days} />
            </div>
            <div className="font-medium mb-1">{prayer.name}</div>
            <p className="text-sm text-[var(--muted)] line-clamp-3 mb-3">{prayer.prayer_request}</p>
            <div className="flex flex-wrap gap-1.5 mb-2">
              <CategoryBadge category={prayer.category} />
            </div>
            <div className="text-xs text-[var(--muted)] flex items-center justify-between">
              <span style={{ color: ministryColor(prayer.assigned_ministry) }}>{prayer.assigned_ministry ?? "—"}</span>
              <span>{formatRelative(prayer.last_updated)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
