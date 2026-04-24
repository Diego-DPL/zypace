-- Zonas de entrenamiento estimadas desde datos históricos de Strava
-- Calculadas por la Edge Function calibrate-zones

alter table public.profiles
  add column if not exists z1_pace_sec_km    integer,   -- Z1 fácil/aeróbico (sec/km)
  add column if not exists z4_pace_sec_km    integer,   -- Z4 umbral LT2 (sec/km)
  add column if not exists z5_pace_sec_km    integer,   -- Z5 VO2max (sec/km)
  add column if not exists estimated_5k_sec  integer,   -- 5k estimado (segundos)
  add column if not exists estimated_10k_sec integer,   -- 10k estimado (segundos)
  add column if not exists zones_confidence  text check (zones_confidence in ('alta','media','baja')),
  add column if not exists zones_activities  integer,   -- nº actividades usadas en calibración
  add column if not exists zones_calibrated_at timestamptz;
