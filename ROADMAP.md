# Zypace — Roadmap del Proyecto

> Última actualización: junio 2026

---

## Implementado y en producción

### Infraestructura y autenticación
- [x] React 19 + Vite + TypeScript + Tailwind v4
- [x] Firebase Auth (email/contraseña, rutas protegidas)
- [x] Firestore como base de datos principal
- [x] Firebase Cloud Functions v2 (europe-west1)
- [x] Stripe: suscripción mensual, portal de cliente, códigos de descuento, cuenta exenta (`is_exempt`)
- [x] Reglas de Firestore con separación cliente / Cloud Function
- [x] SEO básico (react-helmet-async, sitemap)
- [x] Política de cookies + GDPR
- [x] PWA: manifest + service worker + offline shell

### Integración Strava
- [x] OAuth2 flow completo (conectar / desconectar)
- [x] Sincronización manual de actividades (30 días / 180 días retroactivo)
- [x] Webhook Strava en tiempo real (auto-completado de workouts)
- [x] Matching actividad → workout por distancia/tiempo con tolerancia ±25%
- [x] Filtro `sport_type` en matching: running vs fuerza vs ciclismo/otras
- [x] `start_date_local` para evitar desfases UTC en entrenamientos de medianoche
- [x] Calibración de zonas automática (Riegel desde actividades) y manual

### Planes de entrenamiento con IA
- [x] Generación del primer mesociclo (OpenAI Responses API, JSON mode)
- [x] Generación del siguiente mesociclo con continuidad de estrategia
- [x] Auto-generación del siguiente mesociclo (scheduled function + email)
- [x] Metodologías: polarizado (Seiler), noruego (doble umbral), clásica
- [x] Herencia completa entre mesociclos: metodología, superficie, carreras B/C, fases
- [x] Análisis de fatiga (RPE, sensaciones, suffer score, sueño) para adaptar carga
- [x] Últimos 7-10 workouts reales pasados al prompt del siguiente mesociclo
- [x] Check-in semanal del atleta (readiness + contexto vital)
- [x] Bloque de fuerza running-specific con progresión por fase
- [x] Trail running: tipos "subida" y "largo trail" con D+, power hiking, técnica de bajada
- [x] Fallback algorítmico cuando la IA falla o incumple restricciones de días
- [x] `validateDayCompliance` + `buildDayScheduleHint` + `buildFallbackMesocycle`
- [x] `plan_start_date` inmutable — fases calculadas correctamente en mesociclo 3+
- [x] Structured Outputs / JSON mode (`text.format.type: json_object`)
- [x] `max_output_tokens: 16384` — sin truncado en mesociclos con fuerza
- [x] `PROMPT_VERSION` constante + token logging por generación en `generation_log`
- [x] Persistencia del plan inicial en servidor (batch write, no ~35 addDoc del cliente)
- [x] Idempotencia en generación: borrado de rango antes de insertar

### Calendario y seguimiento
- [x] Vista de calendario (react-big-calendar) con workouts + carreras
- [x] Marcar workouts como completados (manual o vía Strava)
- [x] RPE, sensación y notas por workout (`WorkoutModal`)
- [x] Calendario de carreras (`RacesPage`) con prioridades A/B/C
- [x] Análisis semanal (`analyzeWeek`): adherencia, desviación de ritmos, ajustes propuestos
- [x] Aplicar ajustes de `analyzeWeek` con 1 clic
- [x] Reprogramar workout perdido al siguiente día libre (1 clic)
- [x] Exportar plan a ICS / Google Calendar
- [x] Modo semana de viaje/enfermedad (regenera semana con carga mínima)

### Dashboard y métricas
- [x] HomePage con CTL/ATL/TSB (pseudo-PMC), ACWR, km semanales, trend 4 semanas
- [x] Distribución de intensidad por zona (Z1/Z4/Z5)
- [x] Progreso del plan (% completado)
- [x] Vista "Hoy" como hero card del HomePage
- [x] Streak de semanas con ≥50% de adherencia
- [x] Onboarding checklist
- [x] NPS modal
- [x] Tarjeta compartible al completar mesociclo / carrera

### Email y comunicaciones (Resend)
- [x] Welcome al registrarse
- [x] "Plan listo" al crear plan (solo mesociclo 1)
- [x] "Mesociclo listo" al auto-generarse el siguiente
- [x] Email diario del entrenamiento (opt-in, 07:00)
- [x] Check-in de domingo (18:00) con deep-link a análisis semanal
- [x] Recordatorio de carrera a 7 días
- [x] Resumen semanal (lunes, 08:00)
- [x] Email de reactivación a cancelaciones (30 días)
- [x] Notificación de respuesta/resolución de incidencias

### Seguridad
- [x] Verificación de suscripción server-side en todas las funciones de IA
- [x] Rate limiting basado en `generation_log` (server-only write)
- [x] `plan_start_date` inmutable

### Tests
- [x] Vitest + tests para `planHelpers.ts` (computePhases, estimateZones, validateDayCompliance, buildFallbackMesocycle) — 18 tests

---

## En progreso / Próximo sprint

### Usabilidad
- [ ] **Wizard de creación del plan por pasos** (Carrera → Objetivo → Disponibilidad → Perfil → Lesiones → Revisión)
- [ ] **Unificar PlanManagerModal / TrainingPlanPage** en hook `usePlanGeneration()`

---

## Backlog (según tracción)

- [ ] Mini-eval de modelos (5 perfiles tipo) antes de cambiar `OPENAI_MODEL`
- [ ] Generación por bloques de 2 semanas para mesociclos largos con fuerza
- [ ] Ampliar tests: regex de parsing, flujo completo de generación
