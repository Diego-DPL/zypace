-- Añade columnas de metadatos a strava_tokens para diagnóstico y funcionalidad ampliada
alter table public.strava_tokens
  add column if not exists scope text,
  add column if not exists athlete_id bigint,
  add column if not exists athlete jsonb;

-- Índice útil por athlete
create index if not exists idx_strava_tokens_athlete on public.strava_tokens(athlete_id);
