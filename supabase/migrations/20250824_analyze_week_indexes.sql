-- Índices para mejorar el rendimiento de analyze-week

-- Índice compuesto para filtrar workouts por plan + fecha (usado en analyze-week)
create index if not exists idx_workouts_plan_date
  on public.workouts(plan_id, workout_date);

-- Índice para filtrar actividades Strava por usuario + fecha (ventana de análisis)
create index if not exists idx_strava_activities_user_date_range
  on public.strava_activities(user_id, start_date desc);

-- Índice para workouts completados (usado en adherencia)
create index if not exists idx_workouts_plan_completed
  on public.workouts(plan_id, is_completed)
  where is_completed = true;
