-- Añadir métricas estimadas a workouts
alter table public.workouts
  add column if not exists distance_km numeric,
  add column if not exists duration_min int;

create index if not exists idx_workouts_user_date on public.workouts(user_id, workout_date);
