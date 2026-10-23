alter table public.anniversaries
  add column if not exists count_mode text not null default 'countdown'
  check (count_mode in ('countdown','forward'));
