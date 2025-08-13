-- Agrega metadatos del modelo de IA al plan de entrenamiento
alter table public.training_plans
  add column if not exists model text,
  add column if not exists used_fallback boolean,
  add column if not exists attempts int,
  add column if not exists openai_error text;

-- Índice opcional para análisis (modelo usados)
create index if not exists idx_training_plans_model on public.training_plans(model);
