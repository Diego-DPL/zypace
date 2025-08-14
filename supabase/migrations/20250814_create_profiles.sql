-- Perfil de usuario extendido
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  first_name text,
  last_name text,
  birth_date date,
  gender text check (gender in ('male','female','other','prefer_not')),
  country text,
  experience_level text check (experience_level in ('beginner','intermedio','avanzado','elite')),
  primary_goal text,
  last_10k_time_sec integer,
  availability_days text[] check (availability_days <@ array['mon','tue','wed','thu','fri','sat','sun']),
  accepted_terms boolean not null default false,
  terms_version text,
  accepted_terms_at timestamptz,
  created_at timestamptz default now()
);

-- RLS
alter table public.profiles enable row level security;

create policy "Users view own profile" on public.profiles for select using (auth.uid() = user_id);
create policy "Users insert own profile" on public.profiles for insert with check (auth.uid() = user_id);
create policy "Users update own profile" on public.profiles for update using (auth.uid() = user_id);
