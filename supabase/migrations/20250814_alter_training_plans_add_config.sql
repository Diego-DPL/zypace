-- Añadir configuración personalizada de generación de plan
alter table public.training_plans
  add column if not exists run_days_per_week int,
  add column if not exists include_strength boolean,
  add column if not exists strength_days_per_week int,
  add column if not exists last_race_distance_km numeric,
  add column if not exists last_race_time_sec int,
  add column if not exists target_race_time_sec int;

create index if not exists idx_training_plans_run_days on public.training_plans(run_days_per_week);
