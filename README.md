# Prayer Updater

A simple, warm home for Faith Assembly of God International's prayer list —
replacing the Excel workbook with a searchable, filterable, single-admin web
app that can push updates straight into a connected Canva design.

Built with Next.js 16 (App Router), TypeScript, Tailwind CSS, and Supabase
(Postgres). Deploys to Vercel.

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
src/app/settings/        Review threshold & admin info
src/app/api/canva/oauth/ Canva OAuth start/callback route handlers
src/lib/                 Data access (Supabase), auth, Canva client, mapping
src/lib/canva/           OAuth, Autofill API client, connection storage, mapping
src/components/          Client components (table, filters, Canva UI)
src/types/                Shared TypeScript types
supabase/migrations/      SQL schema
scripts/import-excel.ts   One-time Excel → Supabase import
```

## 1. Database setup (Supabase)

1. Create a free project at [supabase.com](https://supabase.com).
2. In the SQL Editor, run `supabase/migrations/0001_init.sql`. This creates
   the `prayers`, `prayer_history`, and `canva_connections` tables, indexes,
   full-text search, and audit triggers.
3. In **Project Settings → API**, copy the **Project URL** and the
   **service_role** key (not the anon key — this app is single-admin and
   talks to Postgres only from trusted server code).

## 2. Local development

```bash
npm install
cp .env.example .env.local
# fill in SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_PASSWORD, SESSION_SECRET
npm run dev
```

Generate a session secret with `openssl rand -hex 32`. Pick any admin
password you like — there's only one account.

Visit `http://localhost:3000`, sign in with `ADMIN_PASSWORD`, and you're in.

## 3. Import the existing Excel prayer list

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

Run it again any time you need to re-import — it always inserts new rows,
so back up or clear the `prayers` table first if you're re-running a full
import rather than adding new entries.

## 4. Canva setup

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
  Templates: full setup below gives you real one-click Canva updates.
- If not: the app still works end-to-end. Connect Canva only to click "Open
  in Canva," and use the **Copy for Canva** button to grab clean, formatted
  text to paste in manually. The architecture (OAuth, token storage, field
  mapping) is already there — nothing to rebuild if you upgrade later.

### Steps

1. Go to the [Canva Developer Portal](https://www.canva.com/developers/)
   and create a new **Integration**.
2. Under **Authentication**, generate a **Client Secret** and note the
   **Client ID**.
3. Add a **Redirect URL**: `https://your-app.vercel.app/api/canva/oauth/callback`
   (and `http://localhost:3000/api/canva/oauth/callback` for local dev).
4. Under **Scopes**, enable: `design:content:read`, `design:content:write`,
   `design:meta:read`, `brandtemplate:meta:read`, `brandtemplate:content:read`,
   `asset:read`, `asset:write`.
5. Set `CANVA_CLIENT_ID`, `CANVA_CLIENT_SECRET`, and `CANVA_REDIRECT_URI` in
   your environment (see `.env.example`).
6. In the app, go to **Canva → + Connect Canva** and sign in.
7. Click **Change Template** to list your organization's Brand Templates and
   pick the one used for the prayer list graphic.
8. In your Canva Brand Template, create text placeholders (Canva calls these
   "data fields") named to match what you enter under **Template Fields** in
   the app — by default `HEALING_PRAYERS`, `EMPLOYMENT_PRAYERS`,
   `FAMILY_PRAYERS`, `GENERAL_PRAYERS`, `SPIRITUAL_GROWTH_PRAYERS`. Rename
   the fields on either side to match your actual template.
9. Click **🟣 Update Canva** from the Prayer List or Canva page. The app
   groups active prayers by category, fills each mapped field, and creates
   an updated version of the design — the layout and graphics stay exactly
   as designed; only the text content changes.

Access and refresh tokens are stored server-side in `canva_connections` and
are **never** sent to the browser; all Canva API calls happen in Next.js
server actions / route handlers.

## 5. Deploying to Vercel

1. Push this repository to GitHub (or GitLab/Bitbucket).
2. Import it in [Vercel](https://vercel.com/new).
3. Add all the environment variables from `.env.example` in **Project
   Settings → Environment Variables** (use your production Supabase and
   Canva values; set `NEXT_PUBLIC_APP_URL` and `CANVA_REDIRECT_URI` to your
   production domain).
4. Deploy. Run the Supabase migration (step 1) against your production
   Supabase project before or right after the first deploy.
5. Add the production redirect URL to your Canva integration's **Redirect
   URLs** list (step 3 above), matching `CANVA_REDIRECT_URI` exactly.

## Notes on the data model

- `prayers` — the single source of truth. `status` is `ACTIVE`, `ANSWERED`,
  or `ARCHIVED`. A generated `search_vector` column powers full-text search
  across name, request, requester, category, and ministry.
- `prayer_history` — one row per status or request-text change, written
  automatically by a Postgres trigger. This is the audit trail.
- `canva_connections` — one row for the single admin's Canva connection:
  OAuth tokens (never exposed to the browser), the selected Brand Template
  id, the field mapping, and a log of the last sync.

## Security

- Row Level Security is enabled on every table with no public policies —
  the anon key can do nothing. All reads/writes go through server code using
  the service role key.
- The admin session is a signed, httpOnly cookie (HMAC-SHA256 over a
  timestamp, verified in `src/proxy.ts` on every request). There's no
  database-backed session store to keep this genuinely simple for a
  single-admin app.
- Canva OAuth uses Authorization Code + PKCE, the flow Canva requires; the
  client secret is only ever used server-side.
