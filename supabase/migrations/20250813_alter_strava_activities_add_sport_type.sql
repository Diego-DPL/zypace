-- Añadir columna sport_type usada por la función sync-strava
alter table public.strava_activities
  add column if not exists sport_type text;

-- Opcional: índice si luego filtramos por sport_type
create index if not exists idx_strava_activities_user_sport on public.strava_activities(user_id, sport_type);
