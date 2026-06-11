# Zypace — Análisis del proyecto, errores detectados y hoja de ruta

> Fecha del análisis: 11 de junio de 2026
> Alcance: frontend (`src/`), Cloud Functions (`functions/src/`), prompts de IA, reglas de Firestore y flujo de mesociclos.

---

## 1. Resumen ejecutivo

El proyecto está en buen estado general: arquitectura clara (React 19 + Firebase + OpenAI), prompts muy trabajados, fallback algorítmico cuando la IA falla, fatiga/RPE/check-in semanal integrados en la generación, y monetización con Stripe funcionando.

Los problemas más importantes encontrados son:

1. **Bug de cálculo de semana del plan en mesociclos 3+** (las fases base/desarrollo/específico/taper se calculan mal a partir del 3er mesociclo). 🔴
2. **El siguiente mesociclo NO hereda toda la estrategia**: pierde restricciones de superficie (días de montaña/asfalto), el calendario de carreras B/C intermedias y el tope de rodaje largo. 🔴
3. **Sin verificación de suscripción en el servidor** para las funciones que consumen OpenAI: cualquier usuario autenticado puede llamarlas directamente. 🔴
4. **Rate limiting de mesociclos roto**: cuenta una colección que la generación de mesociclos nunca escribe. 🟠
5. **Matching de Strava sin filtrar por deporte**: una salida en bici puede marcar como completado un entrenamiento de running o una sesión de fuerza. 🟠

---

## 2. Errores detectados (priorizados)

### 🔴 E1 — `mesoStartWeek` incorrecto a partir del mesociclo 3

`functions/src/generateNextMesocycle.ts:67`

```ts
const planStartISO = (plan.mesocycle_start_date as string) || todayISO; // start of plan
```

El comentario dice "start of plan", pero `mesocycle_start_date` **se sobrescribe cada vez que se genera un mesociclo** (línea 545-549 del mismo archivo y en el frontend). Consecuencia:

- Mesociclo 2: correcto (el valor aún es el inicio del plan).
- Mesociclo 3+: `weeksElapsed` se calcula desde el inicio del mesociclo 2, no del plan. Si el plan tiene 16 semanas y mesociclos de 5, el mesociclo 3 se genera creyendo que empieza en la **semana 6** cuando en realidad es la **semana 11**.

Efectos en cascada:
- `phaseForWeek()` asigna fase equivocada → el atleta puede quedarse en "desarrollo" cuando debería estar en "específico", y el taper puede no llegar nunca por esta vía.
- La regla del prompt "Descarga cada 4ª semana del plan (semana `mesoStartWeek + 3`)" apunta a la semana equivocada.

**Fix**: guardar un campo inmutable `plan_start_date` en el doc del plan al crearlo (en `generatePlan` meta y en el frontend), y usarlo en `generateNextMesocycle`. Para planes existentes, derivarlo: `raceDate − total_weeks × 7 días`.

---

### 🔴 E2 — El siguiente mesociclo no hereda toda la estrategia (continuidad incompleta)

Comparativa de lo que recibe el prompt en `generatePlan` vs `generateNextMesocycle`:

| Elemento de estrategia | generatePlan | generateNextMesocycle |
|---|---|---|
| Metodología (polarizado/noruego/clásico) | ✅ bloque completo con reglas | ⚠️ solo una etiqueta de 1 línea |
| Días fijos running/fuerza | ✅ | ✅ |
| Perfil del corredor (nivel, edad, lesiones…) | ✅ | ✅ |
| Zonas / ritmo objetivo | ✅ | ✅ |
| Fases del plan completo | ✅ | ✅ (pero con E1 mal indexadas) |
| **`mountain_days_of_week` / `road_only_days_of_week`** | ✅ | ❌ **no se leen del plan ni se pasan al prompt** |
| **`races_context` (carreras B/C intermedias)** | ✅ bloque de calendario con tapers parciales | ❌ **el mesociclo 2+ ignora carreras intermedias** |
| Tope de rodaje largo (`peakLongRun`, regla 2) | ✅ | ❌ sin tope explícito |
| Marca previa (`last_race`) | ✅ | ❌ |
| Adherencia/fatiga/volumen del mesociclo anterior | n/a | ✅ (bien resuelto) |

Lo que sí está bien resuelto en la continuidad: adherencia, índice de fatiga (RPE + sensaciones 14 días), volumen real completado con progresión obligatoria del 5-10%, check-in semanal (`weekly_reviews`) y snapshot histórico en `mesocycle_history`.

**Fix**: en `generateNextMesocycle`, leer `plan.mountain_days_of_week`, `plan.road_only_days_of_week`, las carreras futuras del usuario (con sus prioridades, que ya se guardan en `races/{id}.priority`) y añadir los mismos bloques de prompt que usa `generatePlan` (extraerlos a `planHelpers.ts` para no duplicar). Añadir también el `methodologyBlock` completo y la regla del tope de rodaje largo.

---

### 🔴 E3 — Funciones de IA sin verificación de suscripción en servidor

`generatePlan`, `generateNextMesocycle`, `analyzeWeek` y `calibrateZones` solo comprueban `request.auth?.uid`. El paywall vive en el cliente (`SubscriptionContext`). Cualquier usuario registrado puede invocar las funciones con el SDK y consumir tu crédito de OpenAI sin pagar.

Además, el rate limit de `generatePlan` cuenta `training_plan_versions`, **colección que escribe el cliente** — un cliente malicioso simplemente no la escribe y el límite desaparece.

**Fix**: comprobar en servidor `subscription_status === 'active' || is_exempt` antes de llamar a OpenAI, y llevar el contador de rate-limit en una colección que solo escriban las funciones (p. ej. `users/{uid}/generation_log`, con regla `allow write: if false`).

---

### 🟠 E4 — Rate limiting de mesociclos no cuenta nada

`generateNextMesocycle.ts:35-43` limita por `training_plan_versions.generated_at`, pero la generación de mesociclos **nunca escribe en esa colección** (solo el frontend al generar/regenerar plan completo). Resultado: el límite de "10 mesociclos / 24h" es inoperante, y al revés, generar un plan completo consume cupo de mesociclos.

**Fix**: mismo `generation_log` de E3, con un campo `kind: 'plan' | 'mesocycle'`.

---

### 🟠 E5 — Matching Strava ↔ workouts demasiado laxo

`functions/src/syncStrava.ts:227-263` (y previsiblemente el webhook):

1. **No filtra `sport_type`**: una salida en bici de 30 km o una caminata marca como completado el entrenamiento de running del día.
2. **Las sesiones de fuerza se autocompletan con cualquier actividad ≥1 km**: una descripción tipo "Fuerza base S1…" no tiene km ni minutos, así que cae en la rama `!targetM && !targetSecs` y la completa el rodaje de ese mismo día. Quien hace doblete running+fuerza el mismo día tendrá fuerzas "completadas" sin hacerlas → corrompe la métrica de adherencia que alimenta el siguiente mesociclo.
3. Las fechas se guardan como fecha UTC (`start_date.substring(0,10)`): un rodaje a las 00:30 hora española se guarda en el día anterior y no casa con el workout planificado.

**Fix**: filtrar `sport_type ∈ {Run, TrailRun, VirtualRun}` para workouts de running, `WeightTraining/Workout/Crossfit` para fuerza (o exigir confirmación manual para fuerza), y convertir `start_date_local` de Strava en vez de `start_date`.

---

### 🟠 E6 — `duration_min` corrupto con series en metros

Regex en `generateNextMesocycle.ts:521` y `PlanManagerModal.tsx:483`:

```ts
const durRegex = /(\d{1,3})\s?(?:min|mins|m)\b/i;
```

Una descripción como `"Series 8×400m"` matchea `400m` → `duration_min: 400`. Esto contamina el matching de Strava (8×400 ⇒ busca actividad de 400 minutos… en realidad la rama `targetSecs` matchea cualquier actividad >200 m, otro falso positivo) y cualquier métrica de carga.

**Fix**: excluir la unidad `m` aislada cuando va precedida de `×`/`x` o usar `(?:min|mins)\b` y tratar metros aparte.

---

### 🟠 E7 — Riesgo de workouts duplicados al generar mesociclo

`generateNextMesocycle` hace `batch.set()` de todos los workouts y **después** actualiza el plan. Si la actualización del plan falla (o el usuario reintenta tras un timeout del cliente con la función aún corriendo), se insertan duplicados para las mismas fechas, porque no se borran workouts existentes en el rango `nextStartISO → nextEndISO` antes de insertar.

**Fix**: dentro de la función, borrar primero los workouts del plan en ese rango de fechas (idempotencia), o usar IDs deterministas (`{planId}_{date}`).

---

### 🟡 E8 — `race_id` vs `primary_race_id` inconsistente

- El frontend guarda el plan con `primary_race_id` (`PlanManagerModal.tsx:455`).
- `onPlanCreated` (`triggers.ts:80`) lee `plan.race_id` → el email "plan listo" sale **sin nombre ni fecha de carrera**.
- `analyzeWeek.ts:88` en el modo auto-detección también busca `p.race_id` → si algún día se llama sin `plan_id`, no encuentra plan activo.

**Fix**: unificar a `primary_race_id` con fallback a `race_id` en ambos sitios (como ya hace `generateNextMesocycle:51`).

---

### 🟡 E9 — Adherencia "1.0" sin datos

`generateNextMesocycle.ts:175-177`: si no hay workouts en los últimos 14 días, `adherence = 1` → el prompt recibe "Excelente adherencia (100%) — se puede aumentar la carga". Justo lo contrario de lo prudente: si no hay datos probablemente el usuario dejó de entrenar.

**Fix**: tratar "sin datos" como caso aparte (nota neutral o conservadora en el prompt), igual que hace `analyzeWeek` con su verdict `no_data`.

---

### 🟡 E10 — "La carrera ya pasó" el día de la carrera

`generateNextMesocycle.ts:60`: `raceDate` se parsea a medianoche UTC y se compara con `new Date()` (ahora). El mismo día de la carrera, `raceDate < today` es `true`. Menor, pero molesto. Comparar fechas ISO como strings (`race.date < todayISO`).

### 🟡 E11 — Otros menores

- `ROADMAP.md` está completamente desactualizado: habla de Supabase y marca como pendiente todo lo que ya está hecho (Strava OAuth, planes IA, ajuste inteligente…). Da una imagen equivocada del proyecto.
- `handleGeneratePlan` en `PlanManagerModal` borra el doc del plan y lo recrea → `onPlanCreated` dispara **otro email de "plan listo" en cada regeneración**.
- Persistencia del plan inicial en el **cliente** con ~35-40 `addDoc` secuenciales (lento, y si el usuario cierra la pestaña a mitad queda un plan inconsistente). `generateNextMesocycle` ya lo hace bien en servidor — unificar: que `generatePlan` también persista en servidor.
- `PlanManagerModal.tsx` (1.687 líneas) y `TrainingPlanPage.tsx` (1.450) duplican casi toda la lógica de generación/regeneración. Extraer a un hook `usePlanGeneration()`.
- `estimateZones` (Z5 = p10k×0.90) y `calibrateZones` (Z5 = p5k×0.95) usan fórmulas distintas para la misma zona — unificar en `planHelpers`.
- El cliente extrae `distance_km`/`duration_min` con sus propios regex duplicando los del servidor: si divergen, los datos divergen.

---

## 3. Revisión de los prompts

### Lo que está bien
- Formato JSON con esquema explícito y ejemplos de incorrecto/correcto (fuerza).
- Personalización rica: perfil, lesiones, fases, metodología, terreno trail con D+, fuerza por sesión/fase con referencias científicas.
- `buildDayScheduleHint` (calendario día a día) + `validateDayCompliance` con fallback algorítmico: muy buen patrón de defensa.
- Bloques de fatiga y check-in del atleta en el mesociclo siguiente: diferencial real frente a competidores.

### Mejoras recomendadas

1. **Usar Structured Outputs** (`text: { format: { type: "json_schema", strict: true } }` en la Responses API) en vez de extraer el JSON por índice de `{`/`}`. Elimina los fallos de parseo, que hoy degradan silenciosamente al plan algorítmico (el usuario paga IA y recibe fallback).
2. **Riesgo de truncado**: un mesociclo de 5-8 semanas con fuerza son 35-56 días × explanation detallada. Con `gpt-4o-mini` y sin `max_output_tokens` configurado es fácil cortar el JSON (causa probable de parte de los fallbacks). Opciones: generar por bloques de 2 semanas, o subir `max_output_tokens` explícitamente y validar nº de días devueltos vs esperados (hoy no se valida que vengan TODAS las fechas).
3. **Pasar la última semana real del mesociclo anterior** (descripciones de los 7-10 últimos workouts) al prompt del siguiente mesociclo. Hoy solo van agregados (km totales, RPE medio); la IA no sabe si la última semana fue de descarga o de pico, y puede romper la onda de carga.
4. **Fijar `temperature` baja** (0.2-0.4) para reproducibilidad de estructura.
5. **Versionar los prompts** (constante `PROMPT_VERSION` guardada en el plan/versión) para poder correlacionar calidad de planes con versión de prompt.
6. Registrar `usage` (tokens) de cada llamada en `generation_log` → control de coste por usuario.
7. La regla "EXACTAMENTE N sesiones de running por semana" entra en conflicto con semanas parciales (primera/última del mesociclo si no empiezan en lunes). `validateDayCompliance` ya tolera 10 %, pero conviene decirle a la IA explícitamente cómo tratar semanas incompletas.

---

## 4. ¿`generateNextMesocycle` mantiene la estrategia previa?

**Respuesta corta: parcialmente.** Mantiene metodología (solo como etiqueta), días fijos, perfil, zonas, objetivo, fuerza, fases y — esto está muy bien — adapta la carga con adherencia real, fatiga (RPE/sensaciones) y check-in semanal, con progresión del 5-10 % sobre el volumen real completado.

**Pero pierde**: restricciones de superficie (montaña/asfalto por día), carreras intermedias B/C (¡un mesociclo 2 puede plantar series el día de una carrera B!), tope de rodaje largo, marca previa, y el bloque de metodología completo. Y por el bug E1, a partir del mesociclo 3 ni siquiera sabe en qué semana del plan está. Ver fixes en E1 y E2.

---

## 5. Mejoras de usabilidad y adherencia

### 5.1 Quick wins (máximo impacto / mínimo esfuerzo)

1. **Generación automática del siguiente mesociclo**. Hoy depende de que el usuario entre, vea el banner y pulse el botón (visible solo a ≤14 días del fin). Una `onSchedule` diaria que detecte planes con `mesocycle_end_date` a ≤3 días, genere el siguiente y mande email "Tu mesociclo N está listo — la IA lo ha adaptado a tus sensaciones" cierra el mayor agujero de churn del producto. (La infraestructura ya existe: `scheduled.ts` + `emailService`.)
2. **Email del entrenamiento del día / de mañana** (opt-in). El resumen semanal del lunes ya existe; el recordatorio diario es el driver de adherencia nº 1 en apps de entrenamiento.
3. **Racha (streak) y semanas cumplidas** en HomePage: "3 semanas seguidas ≥80 % de adherencia". Dato ya disponible (`mesocycle_history.adherence_pct`).
4. **Exportar el plan a calendario (ICS / Google Calendar)**: los workouts viven en la app; en el calendario personal del usuario viven sus días. Un endpoint ICS por usuario es barato y aumenta muchísimo la presencia diaria del plan.
5. **Empujar el check-in semanal**: el `WeeklyAnalysis` con readiness/contexto vital es oro para el siguiente mesociclo, pero solo se rellena si el usuario lo abre. Email de domingo tarde "¿Cómo ha ido la semana?" con deep-link.

### 5.2 Adherencia (medio plazo)

6. **Replan automático ligero entre semanas**: `analyzeWeek` ya calcula `adjustments`, pero aplica reducciones genéricas. Ofrecer "aplicar ajustes con 1 clic" desde el email semanal.
7. **Reprogramar workout perdido**: si ayer no se completó la sesión de calidad, ofrecer moverla al siguiente día libre (regla simple, sin IA) en vez de dejarla en rojo. Las sesiones en rojo acumuladas desmotivan y rompen la progresión.
8. **Modo "semana de viaje/enfermedad"**: botón que regenera solo la semana en curso con carga mínima sin tocar el mesociclo. El dato ya existe en `life_context`.
9. **Notificaciones push (PWA)**: la web no es instalable hoy. Manifest + service worker + push del entrenamiento del día convierten la web en app de uso diario sin esperar a `zypace-app`.
10. **Celebrar hitos**: al completar mesociclo, tarjeta-resumen compartible (km, D+, adherencia, mejora de ritmo). Marketing orgánico + refuerzo positivo.

### 5.3 Usabilidad

11. **Unificar la gestión del plan en un solo flujo**: hoy hay dos UIs casi idénticas (página + modal). Además de la deuda técnica, el usuario ve dos sitios distintos para lo mismo.
12. **Wizard de creación del plan por pasos**: el formulario actual tiene ~20 campos en una pantalla. Pasos: Carrera → Objetivo → Disponibilidad → Perfil → Lesiones → Revisión. Con datos del perfil ya pre-rellenados (ya se hace) y opción "usar mi configuración anterior".
13. **Vista "Hoy" como pantalla principal**: el HomePage es un dashboard de métricas (CTL/ATL/ACWR), útil pero frío. La primera tarjeta debería ser SIEMPRE el entrenamiento de hoy con CTA "Marcar como hecho / Ver detalles".
14. **Explicar el fallback**: cuando `used_fallback` es true, el usuario ve "Algoritmo local" sin contexto. Mejor: aviso honesto + botón "Reintentar con IA".
15. **Onboarding guiado al primer plan**: el `OnboardingChecklist` existe; añadir un plan demo de ejemplo pre-generado para usuarios sin carrera todavía.

---

## 6. Hoja de ruta propuesta

### Sprint 1 (1 semana) — Corrección de errores críticos
- [ ] E1: campo inmutable `plan_start_date` + migración de planes existentes.
- [ ] E2: heredar superficie, carreras B/C, tope de largo y metodología completa en `generateNextMesocycle` (extraer builders compartidos a `planHelpers`).
- [ ] E3: check de suscripción server-side en las 4 funciones de IA.
- [ ] E4: `generation_log` server-only para rate limiting real.
- [ ] E9/E10: adherencia sin datos neutral + comparación de fecha de carrera por string.

### Sprint 2 (1-2 semanas) — Integridad de datos
- [ ] E5: filtro `sport_type` en matching (sync + webhook) y fechas con `start_date_local`.
- [ ] E6: regex de duración sin falsos positivos con metros.
- [ ] E7: idempotencia en `generateNextMesocycle` (borrar rango antes de insertar).
- [ ] E8: unificar `primary_race_id`.
- [ ] Mover la persistencia de `generatePlan` al servidor (batch) — el cliente solo pinta.
- [ ] Actualizar `ROADMAP.md` a la realidad del producto.

### Sprint 3 (2 semanas) — Calidad de IA
- [ ] Structured Outputs + validación "todas las fechas presentes".
- [ ] `max_output_tokens` + generación por bloques si el mesociclo es largo.
- [ ] Pasar últimos workouts reales al prompt del mesociclo siguiente.
- [ ] `PROMPT_VERSION` + log de tokens/coste por generación.

### Sprint 4 (2-3 semanas) — Adherencia (el gran salto)
- [ ] Generación automática del siguiente mesociclo (scheduled) + email.
- [ ] Email diario del entrenamiento (opt-in en Settings).
- [ ] Email de domingo con check-in semanal (deep-link).
- [ ] Streaks y % de adherencia visibles en Home.
- [ ] Vista "Hoy" como hero del HomePage.

### Sprint 5 (2-3 semanas) — Presencia diaria
- [ ] PWA: manifest + service worker + push del entrenamiento del día.
- [ ] Exportación ICS/Google Calendar.
- [ ] Reprogramación de workouts perdidos con 1 clic.
- [ ] Aplicar ajustes de `analyzeWeek` con 1 clic desde email.

### Backlog (según tracción)
- [ ] Wizard de creación por pasos + unificación PlanManagerModal/TrainingPlanPage en hook compartido.
- [ ] Tarjeta compartible al completar mesociclo / carrera.
- [ ] Modo viaje/enfermedad (regeneración de semana en curso).
- [ ] Tests (no hay ninguno): empezar por `planHelpers` (computePhases, validateDayCompliance, buildFallbackMesocycle) y los regex de parsing — es lógica pura, fácil de testear y donde viven los bugs E1/E6.
- [ ] Evaluar modelo: `OPENAI_MODEL` es secreto configurable (bien); montar un mini-eval con 5 perfiles tipo para comparar calidad/coste antes de cambiar de modelo.

---

## 7. Apunte final

La base diferencial de Zypace ya existe y funciona: **el bucle datos reales (Strava + RPE + sensaciones) → fatiga → siguiente mesociclo adaptado**. Ningún quick win nuevo vale más que cerrar bien ese bucle: corregir E1/E2 para que la adaptación sea fiel a la estrategia, y automatizar la generación del siguiente mesociclo para que el bucle no dependa de un clic del usuario. Eso es retención pura.
