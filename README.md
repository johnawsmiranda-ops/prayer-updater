# Prayer Updater

A simple, warm home for Faith Assembly of God International's prayer list —
replacing the Excel workbook with a searchable, filterable, single-admin web
app that can push updates straight into a connected Canva design.

Built with Next.js 16 (App Router), TypeScript, and Tailwind CSS. Deploys to
Vercel.

**The database is a single Excel file** — literally a `.xlsx` workbook the
app reads and writes on every change. Locally that's just a file at
`data/prayer-list.xlsx`. Deployed on Vercel, it's the same file stored in
[Vercel Blob](https://vercel.com/docs/storage/vercel-blob) — Vercel's
serverless functions have no persistent local disk, so a plain file on disk
would be wiped between requests; Blob storage is what makes "it's just an
Excel file" actually survive in production. You can download the current
file at any time from Settings → Download Excel file.

## What this replaces

The old workflow: one Excel file (`Prayer List — Healing`, `Prayer List —
General Prayer`), edited by hand, and a *separate* Canva graphic updated by
copy-pasting from it. This app makes the database the single source of
truth — add, edit, search, filter, sort, archive, mark answered — and syncs
the same data into Canva on demand, so the two never drift apart.

## Features

- Spreadsheet-style prayer list: inline add/edit/delete, search, filter
  (year, month, status, category, ministry), sort, pagination.
- Prayers are never silently deleted. Statuses are `ACTIVE` → `ANSWERED` /
  `ARCHIVED`, and every status or request-text change is logged to
  `prayer_history` for a full audit trail.
- "Needs Review" flag: any `ACTIVE` prayer untouched for N days (default 45,
  configurable) is flagged in the UI. The admin decides what happens next —
  nothing is auto-archived.
- Canva sync: connect a Canva Brand Template via the official Canva Connect
  OAuth + Autofill API, map prayer categories to template fields, and push
  the current (or filtered/selected) active prayers into the design with one
  click. If Canva isn't connected, or your Canva plan doesn't support Brand
  Templates, the app falls back to a "Copy for Canva" clean text export —
  the app never fakes a live connection it doesn't have.
- Excel import script that preserves every original row, including the raw
  historical status text, while normalizing status values.

## Project structure

```
src/app/                 Next.js App Router pages, layouts, server actions
src/app/prayers/         Main prayer list + Add Prayer
src/app/archive/         Archived prayers
src/app/canva/           Canva connection UI + Update Canva flow
src/app/settings/        Review threshold, data export, admin info
src/app/api/canva/oauth/ Canva OAuth start/callback route handlers
src/app/api/export/      Download the current Excel "database"
src/lib/                 Data access, auth, Canva client, mapping
src/lib/store/           The Excel-file "database" itself (read/write/mutate)
src/lib/canva/           OAuth, Autofill API client, connection storage, mapping
src/components/          Client components (table, filters, Canva UI)
src/types/                Shared TypeScript types
data/prayer-list.xlsx     Local dev database file (created on first write)
scripts/import-excel.ts   Imports the church's original Excel workbook
```

## 1. Local development

```bash
npm install
cp .env.example .env.local
# fill in ADMIN_PASSWORD, SESSION_SECRET (leave BLOB_READ_WRITE_TOKEN blank)
npm run dev
```

Generate a session secret with `openssl rand -hex 32`. Pick any admin
password you like — there's only one account.

Visit `http://localhost:3000`, sign in with `ADMIN_PASSWORD`, and you're in.
The first write creates `data/prayer-list.xlsx` automatically.

## 2. Import the existing Excel prayer list

```bash
npm run import:excel -- "/path/to/Prayer-list-Updated-08-09-2026.xlsx"
```

This reads both the `Healing` and `General Prayer` sheets and:

- Keeps every row (nothing is dropped).
- Normalizes the old free-text `Status` column:
  - `"Continues Prayer"` / `"Continue prayer"` → `ACTIVE`
  - `"Answered Prayer"` (with a date) → `ANSWERED`, with `date_answered` set
  - `"No Update"` → `ACTIVE` (will surface as Needs Review once it's stale)
  - `"With his/her Creator"` → `ARCHIVED`
  - Anything unrecognized → `ACTIVE`, with the original text preserved
- Always keeps the original status text in `source_status_raw`, so nothing
  about the historical record is lost.

Run it again any time you need to re-import — it always adds new rows on top
of whatever's already in `data/prayer-list.xlsx` (or your Blob store, if
`BLOB_READ_WRITE_TOKEN` is set when you run it), so delete or back up the
existing file first if you're re-running a full import rather than adding
new entries.

## 3. Canva setup

The **Update Canva** button uses Canva's officially supported [Connect
API](https://www.canva.dev/docs/connect/) — specifically OAuth 2.0 +
[Autofill](https://www.canva.dev/docs/connect/autofill-guide/). A plain
"share link" to a Canva design does **not** grant API edit access — Canva
requires a proper OAuth-connected integration, and Autofill only works
against a **Brand Template** (a template published in a Canva **Enterprise**
organization's Brand Kit), not an arbitrary personal design. This is a real
Canva platform limitation, not a shortcut this app is taking.

**What this means in practice:**

- If your church's Canva account is on Canva Enterprise with Brand
  Templates: full setup below gives you real one-click **Update Canva**.
- If not: the app still works end-to-end. Connect Canva to unlock **Edit in
  Canva** (opens the real design) and **Sync From Canva** (pulls whatever
  metadata Canva's API actually exposes). **Update Canva** falls back to
  a "Prepared Canva Update" — clean, formatted text to paste in by hand.
  The architecture (OAuth, token storage, field mapping) is already there —
  nothing to rebuild if you upgrade to Brand Templates later.

The `/canva` page has three distinct actions, matching what Canva's API can
actually do:

| Action | What it does | Requires |
|---|---|---|
| **Update Canva** | Pushes the latest prayer data into the connected design via Autofill | OAuth + a Brand Template (falls back to prepared text otherwise) |
| **Edit in Canva** | Opens the real design in Canva's own editor, for visual changes (fonts, layout, colors) | OAuth + any connected design |
| **Sync From Canva** | Shows what Canva's API reports about the design (title, thumbnail, last modified) | OAuth + any connected design |

**Sync From Canva is intentionally read-only and limited.** Canva's Connect
API has no endpoint that reads a design's live text content back out —
Autofill only writes. So this action can never modify your prayer list; it's
informational, and the app says so plainly rather than pretending otherwise.

### Steps

1. Go to the [Canva Developer Portal](https://www.canva.com/developers/)
   and create a new **Integration**.
2. Under **Authentication**, generate a **Client Secret** and note the
   **Client ID**.
3. Add a **Redirect URL**: `https://your-app.vercel.app/api/canva/oauth/callback`
   (and `http://localhost:3000/api/canva/oauth/callback` for local dev).
4. Under **Scopes**, enable: `design:content:read`, `design:content:write`,
   `design:meta:read`, `brandtemplate:meta:read`, `brandtemplate:content:read`,
   `asset:read`, `asset:write`, `profile:read`.
5. Set `CANVA_CLIENT_ID`, `CANVA_CLIENT_SECRET`, and `CANVA_REDIRECT_URI` in
   your environment (see `.env.example`) — these are the only Canva
   variables this app needs. (There is no `CANVA_ACCESS_TOKEN` variable —
   access tokens come from the OAuth flow at runtime and are stored in the
   workbook's CanvaConnection sheet, not in environment variables.)
6. In the app, go to **Canva → + Connect Canva** and sign in with your
   actual Canva account.
7. Under **Canva Design**, either paste a link to your existing design (for
   **Edit in Canva** / **Sync From Canva** right away), or click **pick from
   my Brand Templates** if your org has one set up for Autofill.
8. If using a Brand Template: in Canva, create text placeholders (Canva
   calls these "data fields") named to match what you enter under **Show
   template field mapping** in the app — by default `HEALING_PRAYERS`,
   `EMPLOYMENT_PRAYERS`, `FAMILY_PRAYERS`, `GENERAL_PRAYERS`,
   `SPIRITUAL_GROWTH_PRAYERS`. Rename either side to match your template.
9. Click **🟣 Update Canva**. With a Brand Template connected, this fills
   each mapped field and creates an updated version of the design — the
   layout and graphics stay exactly as designed, only the text changes.
   Without one, it prepares the same content as text to paste in yourself.

Access and refresh tokens are stored server-side in the workbook's
CanvaConnection sheet and are **never** sent to the browser; all Canva API
calls happen in Next.js server actions / route handlers. Edit and view URLs
are fetched fresh from Canva each time you click — Canva's own URLs expire
after about 30 minutes, so the app never caches or reuses a stale one.

## 4. Deploying to Vercel

1. Push this repository to GitHub (or GitLab/Bitbucket).
2. Import it in [Vercel](https://vercel.com/new).
3. In the new project, go to **Storage → Create Database → Blob** and
   attach it. This adds `BLOB_READ_WRITE_TOKEN` to the project automatically
   — that's what switches the app from the local file to durable storage.
4. Add the rest of the environment variables from `.env.example` in
   **Project Settings → Environment Variables**: `ADMIN_PASSWORD`,
   `SESSION_SECRET`, your Canva values, and set `NEXT_PUBLIC_APP_URL` /
   `CANVA_REDIRECT_URI` to your production domain.
5. Deploy.
6. Import your prayer list into production by running the import script
   locally with `BLOB_READ_WRITE_TOKEN` (copy it from Vercel's environment
   variables into a one-off local `.env.local`) — or just sign in to the
   deployed app and use **Add Prayer** to start fresh.
7. Add the production redirect URL to your Canva integration's **Redirect
   URLs** list (Canva setup, step 3 above), matching `CANVA_REDIRECT_URI`
   exactly.

## Notes on the data model

Everything lives in one workbook (`src/lib/store/workbook.ts` is the only
place that reads or writes it):

- **Prayers** sheet — the single source of truth. `status` is `ACTIVE`,
  `ANSWERED`, or `ARCHIVED`. Search/filter/sort all run in memory over this
  sheet — plenty fast for a church-sized prayer list (hundreds, not
  millions, of rows).
- **History** sheet — one row per status or request-text change, written
  automatically whenever a prayer is edited. This is the audit trail; the
  original spreadsheet's status text is also preserved per-row in
  `source_status_raw`, so nothing from the old data is lost.
- **CanvaConnection** sheet — a single row holding the admin's Canva
  connection: OAuth tokens (never exposed to the browser), the selected
  Brand Template id, the category → field mapping, and the last sync log.

Every write goes through `mutateDb()`, which reads the whole file, applies
the change, and writes it back. That's simple and transparent (it really is
"just the Excel file"), with one honest tradeoff: it's a same-process
write queue, not a database transaction, so it protects against a double
click but not against two people editing at the exact same instant from two
different machines. Fine for one admin; worth knowing if that ever changes.

## Security

- The admin session is a signed, httpOnly cookie (HMAC-SHA256 over a
  timestamp, verified in `src/proxy.ts` on every request). There's no
  database-backed session store to keep this genuinely simple for a
  single-admin app.
- Canva OAuth uses Authorization Code + PKCE, the flow Canva requires; the
  client secret and Canva access/refresh tokens are only ever used
  server-side, stored inside the workbook's CanvaConnection sheet, and
  stripped out before that data ever reaches the browser.
- The Vercel Blob store is set to `public` access (required for the app's
  server code to fetch it by URL) but its pathname isn't guessable/listed
  anywhere public-facing — anyone who'd need the file already has admin
  access to the app.
