-- WeiS-Space Drive core schema
-- Apply this migration in Supabase SQL Editor before using the Drive database features.
-- This migration is isolated from existing finance/planner tables.

create table if not exists public.drive_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  parent_id uuid references public.drive_folders(id) on delete set null,
  name text not null check (char_length(trim(name)) between 1 and 180),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists drive_folders_user_parent_idx
  on public.drive_folders(user_id, parent_id) where deleted_at is null;

create unique index if not exists drive_folders_unique_active_name_idx
  on public.drive_folders(user_id, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name))
  where deleted_at is null;

create table if not exists public.drive_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  folder_id uuid references public.drive_folders(id) on delete set null,
  name text not null,
  mime_type text not null default 'application/octet-stream',
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  sha256 text,
  status text not null default 'pending'
    check (status in ('pending', 'ready', 'failed', 'trashed')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists drive_files_user_folder_idx
  on public.drive_files(user_id, folder_id, created_at desc) where deleted_at is null;

create index if not exists drive_files_user_status_idx
  on public.drive_files(user_id, status, created_at desc);

create table if not exists public.drive_file_locations (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null references public.drive_files(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('nas', 's3')),
  object_key text not null,
  state text not null default 'pending'
    check (state in ('pending', 'ready', 'missing', 'failed')),
  checksum text,
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(file_id, provider)
);

create index if not exists drive_file_locations_user_provider_idx
  on public.drive_file_locations(user_id, provider, state);

create table if not exists public.drive_sync_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  file_id uuid references public.drive_files(id) on delete set null,
  source_provider text not null check (source_provider in ('nas', 's3')),
  target_provider text not null check (target_provider in ('nas', 's3')),
  operation text not null check (operation in ('upload', 'download', 'verify', 'delete')),
  state text not null default 'queued'
    check (state in ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists drive_sync_tasks_user_created_idx
  on public.drive_sync_tasks(user_id, created_at desc);

create table if not exists public.drive_audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  file_id uuid references public.drive_files(id) on delete set null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists drive_audit_logs_user_created_idx
  on public.drive_audit_logs(user_id, created_at desc);

alter table public.drive_folders enable row level security;
alter table public.drive_files enable row level security;
alter table public.drive_file_locations enable row level security;
alter table public.drive_sync_tasks enable row level security;
alter table public.drive_audit_logs enable row level security;

drop policy if exists "drive_folders_owner_all" on public.drive_folders;
create policy "drive_folders_owner_all" on public.drive_folders
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "drive_files_owner_all" on public.drive_files;
create policy "drive_files_owner_all" on public.drive_files
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "drive_file_locations_owner_all" on public.drive_file_locations;
create policy "drive_file_locations_owner_all" on public.drive_file_locations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "drive_sync_tasks_owner_all" on public.drive_sync_tasks;
create policy "drive_sync_tasks_owner_all" on public.drive_sync_tasks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "drive_audit_logs_owner_all" on public.drive_audit_logs;
create policy "drive_audit_logs_owner_all" on public.drive_audit_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

comment on table public.drive_files is 'WeiS-Space Drive file metadata only; binary content stays in NAS or approved object storage.';
comment on table public.drive_file_locations is 'Physical copies of a logical file across storage providers.';
comment on table public.drive_sync_tasks is 'Background storage transfer and verification queue.';
