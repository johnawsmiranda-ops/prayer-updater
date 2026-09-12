-- Prayer Updater — initial schema
-- Single-admin church prayer list, replacing the Excel workflow.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

do $$ begin
  create type prayer_status as enum ('ACTIVE', 'ANSWERED', 'ARCHIVED');
exception
  when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- prayers — the single source of truth (replaces the Excel sheets)
-- ---------------------------------------------------------------------------

create table if not exists prayers (
  id uuid primary key default gen_random_uuid(),

  year integer not null,
  name text not null,
  prayer_request text not null default '',
  requested_by text,
  category text not null default 'General',
  assigned_ministry text,

  status prayer_status not null default 'ACTIVE',
  notes text,

  date_added date not null default current_date,
  last_updated timestamptz not null default now(),
  date_answered date,

  -- free-text memory of the original Excel "Status" cell, kept for
  -- traceability when we normalize messy historical values on import
  source_status_raw text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists prayers_status_idx on prayers (status);
create index if not exists prayers_year_idx on prayers (year);
create index if not exists prayers_category_idx on prayers (category);
create index if not exists prayers_ministry_idx on prayers (assigned_ministry);
create index if not exists prayers_last_updated_idx on prayers (last_updated);

-- simple full text search across the fields the UI searches
alter table prayers add column if not exists search_vector tsvector
  generated always as (
    to_tsvector('english',
      coalesce(name, '') || ' ' ||
      coalesce(prayer_request, '') || ' ' ||
      coalesce(requested_by, '') || ' ' ||
      coalesce(category, '') || ' ' ||
      coalesce(assigned_ministry, '')
    )
  ) stored;

create index if not exists prayers_search_idx on prayers using gin (search_vector);

-- ---------------------------------------------------------------------------
-- prayer_history — audit trail; nothing about a prayer is ever silently lost
-- ---------------------------------------------------------------------------

create table if not exists prayer_history (
  id uuid primary key default gen_random_uuid(),
  prayer_id uuid not null references prayers (id) on delete cascade,

  previous_status prayer_status,
  new_status prayer_status,
  previous_request text,
  new_request text,

  changed_at timestamptz not null default now(),
  changed_by text not null default 'admin'
);

create index if not exists prayer_history_prayer_id_idx on prayer_history (prayer_id);

-- ---------------------------------------------------------------------------
-- canva_connections — one row per connected Canva template/design
-- ---------------------------------------------------------------------------

create table if not exists canva_connections (
  id uuid primary key default gen_random_uuid(),
  user_id text not null default 'admin',

  -- Canva "brand template" id (preferred, supports the Autofill API) and/or
  -- a plain design id (fallback: manual "open in Canva" only, no autofill)
  template_id text,
  design_id text,
  template_name text,

  connection_status text not null default 'DISCONNECTED'
    check (connection_status in ('DISCONNECTED', 'CONNECTED', 'ERROR')),

  -- OAuth tokens are encrypted/opaque at rest and NEVER sent to the browser;
  -- only server code (API routes / server actions) reads this table.
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,

  -- how prayer fields map onto this template's autofill field names, e.g.
  -- {"HEALING_PRAYERS": "healing", "EMPLOYMENT_PRAYERS": "employment", ...}
  field_mapping jsonb not null default '{}'::jsonb,

  last_synced_at timestamptz,
  last_sync_summary jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- updated_at / audit triggers
-- ---------------------------------------------------------------------------

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists prayers_set_updated_at on prayers;
create trigger prayers_set_updated_at
  before update on prayers
  for each row execute function set_updated_at();

drop trigger if exists canva_connections_set_updated_at on canva_connections;
create trigger canva_connections_set_updated_at
  before update on canva_connections
  for each row execute function set_updated_at();

-- log a history row whenever status or the request text actually changes,
-- and bump last_updated so "needs review" resets correctly
create or replace function log_prayer_change()
returns trigger as $$
begin
  if (old.status is distinct from new.status)
     or (old.prayer_request is distinct from new.prayer_request) then
    insert into prayer_history (
      prayer_id, previous_status, new_status, previous_request, new_request
    ) values (
      new.id, old.status, new.status, old.prayer_request, new.prayer_request
    );
    new.last_updated = now();
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists prayers_log_change on prayers;
create trigger prayers_log_change
  before update on prayers
  for each row execute function log_prayer_change();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- Single-admin app: all access goes through the server (service role / a
-- signed-in admin session), never directly from the browser with the anon
-- key. RLS is enabled with no public policies so the anon key can read/write
-- nothing by default.
-- ---------------------------------------------------------------------------

alter table prayers enable row level security;
alter table prayer_history enable row level security;
alter table canva_connections enable row level security;
