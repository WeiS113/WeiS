-- Microsoft To Do integration. Run in Supabase SQL Editor before enabling the connection.
create table if not exists public.microsoft_todo_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  scope text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.microsoft_todo_connections enable row level security;
revoke all on public.microsoft_todo_connections from anon, authenticated;

create table if not exists public.microsoft_todo_task_links (
  user_id uuid not null references auth.users(id) on delete cascade,
  local_task_id bigint not null,
  microsoft_task_id text not null,
  microsoft_list_id text not null,
  snapshot jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, local_task_id),
  unique (user_id, microsoft_task_id, microsoft_list_id)
);
alter table public.microsoft_todo_task_links enable row level security;
revoke all on public.microsoft_todo_task_links from anon, authenticated;
