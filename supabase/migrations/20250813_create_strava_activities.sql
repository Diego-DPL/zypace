-- Tabla de actividades importadas de Strava
create table if not exists public.strava_activities (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  activity_id bigint not null,
  name text,
  distance_m double precision,
  moving_time int,
  start_date date not null,
  raw jsonb,
  created_at timestamptz default now(),
  unique(user_id, activity_id)
);

-- RLS
alter table public.strava_activities enable row level security;

create policy "Users select own strava activities" on public.strava_activities
  for select using (auth.uid() = user_id);

create policy "Users insert own strava activities" on public.strava_activities
  for insert with check (auth.uid() = user_id);

create policy "Users update own strava activities" on public.strava_activities
  for update using (auth.uid() = user_id);

-- Índices útiles
create index if not exists idx_strava_activities_user_date on public.strava_activities(user_id, start_date);
create index if not exists idx_strava_activities_user_activity on public.strava_activities(user_id, activity_id);
