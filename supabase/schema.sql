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

-- Arbol genealogico. Una persona sin parent_id es la raiz del arbol.
create table if not exists public.family_trees (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Mi familia',
  created_at timestamptz not null default now()
);

create table if not exists public.family_members (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references public.family_trees(id) on delete cascade,
  parent_id uuid references public.family_members(id) on delete cascade,
  first_name text not null,
  last_name text not null default '',
  paternal_surname text not null default '',
  maternal_surname text not null default '',
  birth_date date,
  birth_place text,
  residence text,
  death_date date,
  burial_place text,
  biography text,
  profession text,
  phone text,
  email text,
  social_links text,
  notes text,
  profile_photo_url text,
  is_deceased boolean not null default false,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.family_members add column if not exists is_deceased boolean not null default false;
alter table public.family_members add column if not exists is_primary boolean not null default false;
alter table public.family_members add column if not exists profile_photo_url text;
alter table public.family_members add column if not exists paternal_surname text not null default '';
alter table public.family_members add column if not exists maternal_surname text not null default '';
alter table public.family_members add column if not exists birth_place text;
alter table public.family_members add column if not exists residence text;
alter table public.family_members add column if not exists death_date date;
alter table public.family_members add column if not exists burial_place text;
alter table public.family_members add column if not exists biography text;
alter table public.family_members add column if not exists profession text;
alter table public.family_members add column if not exists phone text;
alter table public.family_members add column if not exists email text;
alter table public.family_members add column if not exists social_links text;

create index if not exists family_members_tree_idx on public.family_members (tree_id);
create index if not exists family_members_parent_idx on public.family_members (parent_id);

create table if not exists public.family_relationships (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references public.family_trees(id) on delete cascade,
  member_a_id uuid not null references public.family_members(id) on delete cascade,
  member_b_id uuid not null references public.family_members(id) on delete cascade,
  relation_type text not null check (relation_type in ('partner')),
  status text not null default 'together' check (status in ('together', 'separated')),
  created_at timestamptz not null default now(),
  check (member_a_id <> member_b_id),
  unique (tree_id, member_a_id, member_b_id, relation_type)
);

alter table public.family_relationships add column if not exists status text not null default 'together';

alter table public.events enable row level security;
alter table public.photos enable row level security;
alter table public.family_trees enable row level security;
alter table public.family_members enable row level security;
alter table public.family_relationships enable row level security;

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

drop policy if exists "Anyone can manage family trees during MVP" on public.family_trees;
create policy "Anyone can manage family trees during MVP"
on public.family_trees for all to anon using (true) with check (true);

drop policy if exists "Anyone can manage family members during MVP" on public.family_members;
create policy "Anyone can manage family members during MVP"
on public.family_members for all to anon using (true) with check (true);

drop policy if exists "Anyone can manage family relationships during MVP" on public.family_relationships;
create policy "Anyone can manage family relationships during MVP"
on public.family_relationships for all to anon using (true) with check (true);

-- Inserts into photos should be performed by the backend with SUPABASE_SERVICE_ROLE_KEY
-- after Google Drive upload succeeds. Do not expose that key in Angular.
