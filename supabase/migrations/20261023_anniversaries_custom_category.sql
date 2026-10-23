alter table public.anniversaries
  add column if not exists custom_category text not null default '',
  add column if not exists custom_emoji text not null default '🌷';
