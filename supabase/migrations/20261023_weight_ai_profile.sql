-- Extend WeiS weight profile for personalized AI analysis.
alter table public.weight_profiles
  add column if not exists birth_year integer check (birth_year is null or (birth_year >= 1900 and birth_year <= 2100)),
  add column if not exists sex text check (sex is null or sex in ('male','female','other','prefer_not')),
  add column if not exists activity_level text check (activity_level is null or activity_level in ('low','light','moderate','high')),
  add column if not exists goal_type text check (goal_type is null or goal_type in ('fat_loss','maintain','muscle','general'));

