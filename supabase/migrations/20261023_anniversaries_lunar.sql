-- Add lunar-calendar metadata to anniversaries without changing existing records.
alter table public.anniversaries
  add column if not exists calendar_type text not null default 'solar' check (calendar_type in ('solar','lunar')),
  add column if not exists lunar_month smallint,
  add column if not exists lunar_day smallint,
  add column if not exists lunar_year smallint;
