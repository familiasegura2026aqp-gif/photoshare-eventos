create extension if not exists pgcrypto;

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  drive_folder_id text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  expires_at timestamptz
);

create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  filename text not null,
  drive_file_id text,
  thumbnail_url text,
  created_at timestamptz not null default now(),
  uploader_name text
);

create index if not exists events_code_idx on public.events (code);
create index if not exists photos_event_created_idx on public.photos (event_id, created_at desc);

alter table public.events enable row level security;
alter table public.photos enable row level security;

drop policy if exists "Anyone can read active events by code" on public.events;
create policy "Anyone can read active events by code"
on public.events
for select
to anon
using (is_active = true);

drop policy if exists "Anyone can create events during MVP" on public.events;
create policy "Anyone can create events during MVP"
on public.events
for insert
to anon
with check (true);

drop policy if exists "Anyone can read event photos" on public.photos;
create policy "Anyone can read event photos"
on public.photos
for select
to anon
using (
  exists (
    select 1
    from public.events
    where events.id = photos.event_id
      and events.is_active = true
  )
);

-- Inserts into photos should be performed by the backend with SUPABASE_SERVICE_ROLE_KEY
-- after Google Drive upload succeeds. Do not expose that key in Angular.
