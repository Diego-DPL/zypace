-- Añade campo JSON para explicación detallada de cada entrenamiento
alter table public.workouts add column if not exists explanation_json jsonb;
create index if not exists idx_workouts_explanation_json on public.workouts using gin(explanation_json);
