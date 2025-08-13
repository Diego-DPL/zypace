-- Historial de versiones de planes
create table if not exists public.training_plan_versions (
  id bigserial primary key,
  plan_id bigint not null references public.training_plans(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  race_id bigint not null,
  goal text,
  model text,
  used_fallback boolean,
  attempts int,
  openai_error text,
  generated_at timestamptz default now(),
  plan_json jsonb not null
);

alter table public.training_plan_versions enable row level security;
create policy "select own plan versions" on public.training_plan_versions for select using (auth.uid() = user_id);
create policy "insert own plan versions" on public.training_plan_versions for insert with check (auth.uid() = user_id);
create index if not exists idx_plan_versions_plan on public.training_plan_versions(plan_id);
create index if not exists idx_plan_versions_user_race on public.training_plan_versions(user_id, race_id);
