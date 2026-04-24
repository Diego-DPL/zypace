// generatePlan — Generates a personalized running training plan using OpenAI + algorithmic fallback.
// Ported from Supabase Edge Function to Firebase Cloud Functions.

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';

const openAiApiKey = defineSecret('OPENAI_API_KEY');
const openAiModel  = defineSecret('OPENAI_MODEL');

// ═══════════════════════════════════════════════════════════════
// ZONES — Seiler & Tønnessen (2009), Riegel formula
// ═══════════════════════════════════════════════════════════════

function secToMinStr(s: number): string {
  const mm = Math.floor(s / 60);
  const ss = Math.round(s % 60).toString().padStart(2, '0');
  return `${mm}:${ss}/km`;
}

interface TrainingZones {
  z1: string;
  z4: string;
  z5: string;
  race: string;
}

function estimateZones(targetTimeSec: number, distKm: number): TrainingZones | null {
  if (!targetTimeSec || !distKm || distKm <= 0 || targetTimeSec <= 0) return null;
  const t10k = targetTimeSec * Math.pow(10 / distKm, 1.06);
  const p10k = t10k / 10;
  return {
    z1:   secToMinStr(p10k * 1.28),
    z4:   secToMinStr(p10k * 1.02),
    z5:   secToMinStr(p10k * 0.90),
    race: secToMinStr(targetTimeSec / distKm),
  };
}

// ═══════════════════════════════════════════════════════════════
// PERIODIZATION
// ═══════════════════════════════════════════════════════════════

interface PhaseInfo {
  name: 'base' | 'desarrollo' | 'especifico' | 'taper';
  startWeek: number;
  endWeek: number;
  rule: string;
}

function computePhases(totalWeeks: number): PhaseInfo[] {
  if (totalWeeks >= 16) {
    return [
      { name: 'base',       startWeek: 1,              endWeek: 6,                rule: 'Solo Z1. Sin sesiones de calidad. Construir hábito aeróbico. Descarga semana 4.' },
      { name: 'desarrollo', startWeek: 7,              endWeek: totalWeeks - 4,   rule: '1-2 sesiones calidad/sem (Z4-Z5). Descarga cada 4ª semana (−25% volumen).' },
      { name: 'especifico', startWeek: totalWeeks - 3, endWeek: totalWeeks - 2,   rule: 'Trabajo a ritmo de carrera. Volumen pico. 2 sesiones calidad/sem.' },
      { name: 'taper',      startWeek: totalWeeks - 1, endWeek: totalWeeks,       rule: 'Volumen −45%. Mantener 1 sesión corta de intensidad. Frescura máxima.' },
    ];
  }
  if (totalWeeks >= 10) {
    const taper = 2, spec = 2;
    const rest  = totalWeeks - taper - spec;
    const base  = Math.max(2, Math.floor(rest * 0.45));
    return [
      { name: 'base',       startWeek: 1,                             endWeek: base,                     rule: 'Solo Z1. Sin calidad. Base aeróbica. Descarga semana 4 si aplica.' },
      { name: 'desarrollo', startWeek: base + 1,                      endWeek: totalWeeks - taper - spec, rule: '1-2 sesiones calidad/sem. Descarga cada 4ª semana (−25%).' },
      { name: 'especifico', startWeek: totalWeeks - taper - spec + 1, endWeek: totalWeeks - taper,        rule: 'Sesiones a ritmo de carrera. Calidad prioritaria.' },
      { name: 'taper',      startWeek: totalWeeks - taper + 1,        endWeek: totalWeeks,               rule: 'Volumen −40-50%. Activación pre-carrera.' },
    ];
  }
  if (totalWeeks >= 6) {
    return [
      { name: 'base',       startWeek: 1,              endWeek: 2,              rule: 'Rodajes fáciles Z1. Sin calidad. Adaptación.' },
      { name: 'desarrollo', startWeek: 3,              endWeek: totalWeeks - 2, rule: '1 sesión calidad/sem.' },
      { name: 'taper',      startWeek: totalWeeks - 1, endWeek: totalWeeks,     rule: 'Reducir volumen 35-40%.' },
    ];
  }
  if (totalWeeks >= 3) {
    return [
      { name: 'desarrollo', startWeek: 1,           endWeek: totalWeeks - 1, rule: '1 sesión calidad/sem, resto Z1.' },
      { name: 'taper',      startWeek: totalWeeks,  endWeek: totalWeeks,     rule: 'Activación: rodaje suave + strides breves.' },
    ];
  }
  return [
    { name: 'taper', startWeek: 1, endWeek: totalWeeks, rule: 'Plan de activación pre-carrera.' },
  ];
}

function phaseForWeek(phases: PhaseInfo[], w: number): PhaseInfo {
  return phases.find(p => w >= p.startWeek && w <= p.endWeek) ?? phases[phases.length - 1];
}

// ═══════════════════════════════════════════════════════════════
// STRENGTH TRAINING — phase-specific, science-backed
// ═══════════════════════════════════════════════════════════════

interface StrengthSessionData { desc: string; purpose: string; details: string; }

function strengthSession(
  phaseName: string,
  sessionNum: number,
  isRecovery: boolean,
  isTaper:    boolean,
  distKm:     number,
): StrengthSessionData {
  const isTrail = distKm === 0 || distKm > 21;

  if (isTaper) return {
    desc: 'Fuerza mantenimiento pre-carrera',
    purpose: 'Mantener adaptaciones neuromusculares sin acumular fatiga. Volumen -40%, mismas cargas.',
    details: `Sesión ~35min. Reducir series al 60%, no bajar las cargas.
BLOQUE A: Peso muerto rumano 3×4 (carga habitual, excéntrico 2s) · Sentadilla búlgara 2×4/pierna
BLOQUE B: Hip thrust 3×5 explosivo · Calf raise excéntrico 2×8/pierna
BLOQUE C (8min core): Plancha frontal 2×30s · Pallof press 2×8/lado
Sin pliometría. Finaliza con 5min movilidad de cadera y tobillo.`,
  };

  if (isRecovery) return {
    desc: 'Fuerza descarga semanal',
    purpose: 'Semana de descarga: -30% volumen, -20% carga. Mantener patrones neuromusculares.',
    details: `Sesión ~40min.
BLOQUE A: Peso muerto rumano 3×5 (carga -20%, técnica perfecta) · Zancada búlgara 2×6/pierna
BLOQUE B: Curl nórdico 2×4 (asistido si es necesario) · Hip thrust 3×8 (carga ligera)
BLOQUE C (10min): Plancha frontal 2×30s · Plancha lateral 2×20s/lado · Bird-dog 2×8/lado
Sin ejercicios explosivos esta semana.`,
  };

  if (phaseName === 'base') {
    if (sessionNum === 1) return {
      desc: 'Fuerza base S1 — cadena posterior excéntrica',
      purpose: 'Énfasis excéntrico para reforzar tendones (Aquiles, rotuliano) y construir resistencia muscular. Ref: Balsalobre-Fernández et al. (2021) — cargas excéntricas en fase base reducen lesiones en runners hasta un 50%.',
      details: `Sesión ~60min. CLAVE: fase excéntrica MUY lenta (tiempo indicado), explosivo subiendo.

BLOQUE A — Cadena posterior pesada (22min):
  • Peso muerto rumano bilateral: 4×5 reps | excéntrico 4s, concéntrico rápido | RPE 7/10 | 3min descanso
  • Elevaciones de talón en step (calf eccentric): 3×12/pierna | bajada 3s, subida explosiva | 1.5min descanso

BLOQUE B — Single-leg e isquiotibiales (20min):
  • Sentadilla búlgara (sin carga extra o mancuernas ligeras): 3×8/pierna | excéntrico 3s | 2min descanso
  • Curl nórdico (Nordic Hamstring Curl): 3×5 reps excéntricas puras | asistido con banda si es necesario | 3min descanso ⚠ Crítico: reduce rotura de isquios en runners

BLOQUE C — Estabilidad y core (15min):
  • Puente de glúteo con pausa 2s arriba: 3×12
  • Plancha de Copenhague lateral (rodilla apoyada): 3×15s/lado | activa aductores y core lateral
  • Pallof Press con banda: 3×10/lado | antirotación de core
${isTrail
  ? '  • Equilibrio monopodal en superficie inestable (bosu o colchoneta doblada): 3×30s/pierna | estabilidad de tobillo para trail'
  : '  • Sentadilla monopodal asistida (TRX o apoyo): 2×6/pierna | propiocepción'}

Calentamiento 8min: movilidad cadera dinámica, activación glúteo con mini-banda.`,
    };
    if (sessionNum === 2) return {
      desc: 'Fuerza base S2 — upper support y core antirotación',
      purpose: 'Sesión complementaria de base: core profundo, tracción dorsal y estabilidad de hombro para la postura de carrera.',
      details: `Sesión ~55min.

BLOQUE A — Tracción y postura (20min):
  • Remo con mancuerna unilateral: 4×8/lado | 1.5min descanso
  • Face pull con banda: 3×15 | retracción escapular | 1min descanso
  • Superman con pausa 2s: 3×10

BLOQUE B — Core funcional (20min):
  • Plancha frontal con toques de hombro: 3×16 (8/lado)
  • Plancha lateral con elevación de cadera: 3×10/lado
  • Dead bug: 3×10/lado | LENTO, lumbar pegada al suelo siempre
  • Farmer's carry unilateral: 3×20m/lado

BLOQUE C — Glúteo e isquios (12min):
  • Hip Thrust con barra o mancuerna: 4×10 (carga moderada) | pausa 1s arriba
  • Good morning con barra ligera: 3×12

Calentamiento 5min: foam roller toráxico + movilidad de hombros.`,
    };
    return {
      desc: 'Fuerza base S3 — single-leg y estabilidad lateral',
      purpose: 'Tercera sesión de base: fuerza unilateral y estabilidad lateral para terreno irregular.',
      details: `Sesión ~55min.

BLOQUE A — Single-leg (22min):
  • Step-up con mancuernas (cajón a altura de rodilla): 4×8/pierna | 2min descanso
  • Zancada reverse con mancuernas: 3×8/pierna | 1.5min descanso
  • Sentadilla monopodal asistida con TRX: 3×6/pierna | 2min descanso

BLOQUE B — Estabilidad lateral y abductores (15min):
  • Lateral band walk con mini-banda: 3×15 pasos/lado
  • Clamshell con banda: 3×15/lado
  • Step-down excéntrico lateral: 3×8/pierna

BLOQUE C — Tobillo y Achilles (10min):
  • Calf raise monopodal en step (excéntrico 3s): 3×12/pierna
  • Equilibrio monopodal con movimiento de brazos: 3×30s/pierna
  • Tibial anterior raises: 2×15

Calentamiento 8min: movilidad tobillo + banda de cadera.`,
    };
  }

  if (phaseName === 'desarrollo') {
    if (sessionNum === 1) return {
      desc: 'Fuerza desarrollo S1 — fuerza máxima neuromuscular',
      purpose: 'Reclutamiento neuromuscular máximo con cargas >80% 1RM. Støren et al. (2008): 8 semanas de heavy resistance training (HRT) → +8% economía de carrera en corredores de fondo.',
      details: `Sesión ~60min.

BLOQUE A — Fuerza máxima (25min):
  • Peso muerto rumano (80-85% 1RM): 4×4 reps | excéntrico 2s, concéntrico EXPLOSIVO | 3-4min descanso
  • Sentadilla búlgara con mancuernas pesadas: 4×5/pierna | 2.5min descanso

BLOQUE B — Potencia inicial (15min):
  • Step-up explosivo con mancuernas: 3×6/pierna | 2min descanso
  • Box jump bajo (40cm): 3×5 | aterrizaje SUAVE | 2.5min descanso

BLOQUE C — Isquiotibiales y core (15min):
  • Curl nórdico: 3×5 | 2.5min descanso
  • Hip Thrust con barra (carga alta): 4×5 | 2min descanso
  • Plancha lateral con elevación de cadera: 3×10/lado

Calentamiento 8min.`,
    };
    if (sessionNum === 2) return {
      desc: 'Fuerza desarrollo S2 — potencia explosiva y core',
      purpose: 'Fuerza explosiva y core de alta demanda. Complementa la sesión de fuerza máxima.',
      details: `Sesión ~60min.

BLOQUE A — Fuerza explosiva de cadera (20min):
  • Hip Thrust explosivo (75-80% 1RM): 4×5 | 2.5min descanso
  • Jump squat (20-30% 1RM): 4×4 | máxima altura | 3min descanso
  • Plyo calf raise: 3×8 | 2min descanso

BLOQUE B — Tracción pesada (15min):
  • Dominada o jalón al pecho: 4×5 | 2.5min descanso
  • Remo con barra (Pendlay row): 3×6 | 2min descanso

BLOQUE C — Core de alta intensidad (15min):
  • Ab wheel rollout: 3×8 | 1.5min descanso
  • Pallof press pesado: 3×10/lado
  • Hollow body hold: 3×20s
${isTrail ? '  • Lateral bound: 3×5/lado | potencia lateral para trail' : '  • Scissors (tijeras lentas): 3×15/lado'}

Calentamiento 8min.`,
    };
    return {
      desc: 'Fuerza desarrollo S3 — single-leg pesado e isquios',
      purpose: 'Carga máxima unilateral + trabajo específico de isquios. La asimetría de fuerza entre piernas es el predictor #1 de lesiones en runners.',
      details: `Sesión ~60min.

BLOQUE A — Single-leg pesado (25min):
  • RDL monopodal con mancuerna: 4×5/pierna | 2.5min descanso
  • Sentadilla monopodal (pistol squat con TRX): 4×5/pierna | 2.5min descanso

BLOQUE B — Isquiotibiales específico (20min):
  • Curl nórdico (4×5): 3min descanso
  • Good morning pesado: 4×6 | 2min descanso
  • Glute-ham raise o SL hip hinge: 3×8/pierna | 2min descanso

BLOQUE C — Tobillo y estabilidad (10min):
  • Calf raise monopodal en step: 3×12/pierna
  • Equilibrio monopodal sobre bosu: 3×30s/pierna
${isTrail
  ? '  • Step-down lateral excéntrico: 3×8/pierna'
  : '  • Tibial anterior raises: 2×15'}

Calentamiento 8min.`,
    };
  }

  if (phaseName === 'especifico') {
    if (sessionNum === 1) return {
      desc: 'Fuerza específico S1 — pliometría alta intensidad',
      purpose: 'Convertir la fuerza en velocidad de ciclo. Ramírez-Campillo et al. (2014): 6 semanas de pliometría → +4% economía de carrera SIN cambio en VO2max.',
      details: `Sesión ~55min.

BLOQUE A — Pliometría alta intensidad (25min):
  • Box jump (50-60cm): 4×5 | máxima potencia, aterrizaje SUAVE | 3min descanso
  • Salto monopodal horizontal: 4×4/pierna | 2.5min descanso
  • Pogos de tobillo: 4×12 contactos | mínimo tiempo de contacto | 2min descanso

BLOQUE B — Fuerza explosiva de cadera (15min):
  • Hip Thrust explosivo (carga alta): 4×4 | 3min descanso
  • Jump lunge: 3×5/pierna | 2.5min descanso

BLOQUE C — Tendón y tobillo (10min):
  • Curl nórdico mantenimiento: 3×4
  • Calf raise isométrico (en punta de pie, 3×20s)
${isTrail ? '  • Salto lateral a cajón: 3×5/lado' : ''}

Calentamiento 10min.`,
    };
    if (sessionNum === 2) return {
      desc: 'Fuerza específico S2 — pliometría resistencia y velocidad',
      purpose: 'Pliometría de resistencia y control excéntrico a alta velocidad.',
      details: `Sesión ~55min.

BLOQUE A — Pliometría de resistencia (22min):
  • Bounding (zancadas exageradas): 4×20m | 3min descanso
  • Saltos sobre vallas bajas: 4×8 | 2.5min descanso
  • Single-leg pogos: 3×10/pierna | 2min descanso

BLOQUE B — Fuerza de velocidad (20min):
  • Sentadilla búlgara EXPLOSIVA (50% 1RM): 4×5/pierna | 2.5min descanso
  • Step-down excéntrico rápido: 3×8/pierna | 2min descanso

BLOQUE C — Tobillo + core final (10min):
  • Drop jump: 3×4
  • Leg raise: 3×12
  • Tibial raises: 2×15`,
    };
    return {
      desc: 'Fuerza específico S3 — activación y mantenimiento',
      purpose: 'Activación neuromuscular con volumen reducido. Mantener fuerza y potencia sin acumular fatiga.',
      details: `Sesión ~45min.

BLOQUE A — Activación neuromuscular (20min):
  • Peso muerto rumano: 3×4 | 3min descanso
  • Box jump: 3×4 | 100% potencia | 3min descanso
  • Pogos tobillo: 3×10 | 2min descanso

BLOQUE B — Isquios y glúteo (15min):
  • Curl nórdico: 2×4
  • Hip Thrust explosivo: 3×4 pesado
  • Calf raise excéntrico monopodal: 2×10/pierna

BLOQUE C — Core 8min:
  • Plancha frontal 2×30s · Pallof press 2×8/lado

Finaliza con 8min de foam roller y movilidad activa de cadera.`,
    };
  }

  return {
    desc: 'Fuerza running-specific',
    purpose: 'Fuerza funcional para running: prevención de lesiones y mejora de economía de carrera.',
    details: `Sesión ~55min.
BLOQUE A: Peso muerto rumano 4×5 (excéntrico 3s) | 3min descanso
BLOQUE B: Sentadilla búlgara 3×8/pierna | 2min descanso
BLOQUE C: Curl nórdico 3×5 | 3min descanso · Hip Thrust 3×10 | 2min descanso
BLOQUE D: Calf raise excéntrico monopodal 3×12/pierna
Core 12min: plancha frontal, lateral, pallof press, dead bug.`,
  };
}

// ═══════════════════════════════════════════════════════════════
// FUNCTION
// ═══════════════════════════════════════════════════════════════

interface RacePayload {
  id?: string;
  name: string;
  date: string;
  distance?: number | string;
}

interface PlanDay {
  date: string;
  description: string;
  explanation?: {
    type: string;
    purpose: string;
    details: string;
    intensity?: string | null;
    phase?: string | null;
  };
}

export const generatePlan = onCall(
  { region: 'europe-west1', secrets: [openAiApiKey, openAiModel], timeoutSeconds: 540, memory: '512MiB' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'No autenticado');

    const { race, goal, config } = request.data as { race?: RacePayload; goal?: string; config?: Record<string, unknown> };

    if (!race || !goal) throw new HttpsError('invalid-argument', 'Faltan detalles de la carrera o el objetivo.');
    if (!race.date)     throw new HttpsError('invalid-argument', 'La carrera no tiene fecha.');

    const apiKey = openAiApiKey.value();
    if (!apiKey) throw new HttpsError('internal', 'OPENAI_API_KEY no está configurada');

    const model = openAiModel.value() || 'gpt-4o';

    const raceDate = new Date(race.date);
    if (isNaN(raceDate.getTime())) throw new HttpsError('invalid-argument', 'Fecha de carrera inválida');

    const today     = new Date();
    const startDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    if (startDate > raceDate) throw new HttpsError('invalid-argument', 'La fecha de la carrera ya pasó o es anterior a hoy');

    const startISO = startDate.toISOString().split('T')[0];
    const raceISO  = raceDate.toISOString().split('T')[0];

    // ── Config ──────────────────────────────────────────────────
    const runDays         = Math.min(Math.max(Number(config?.run_days_per_week) || 4, 2), 7);
    const includeStrength = !!config?.include_strength;
    const strengthDays    = includeStrength ? Math.min(Math.max(Number(config?.strength_days_per_week) || 1, 1), 3) : 0;
    const lastRace        = config?.last_race as { distance_km?: number; time?: string } | undefined;
    const targetTimeSec   = Number(config?.target_time_seconds) || null;
    const methodology     = ((config?.methodology || 'polarized') as string) as 'polarized' | 'norwegian' | 'classic';
    const distKm          = Number(race.distance) || 0;
    const storedZones     = config?.stored_zones as { z1_sec_km?: number; z4_sec_km?: number; z5_sec_km?: number } | null;

    // ── Zones ───────────────────────────────────────────────────
    let zones: TrainingZones | null = null;
    let targetPace: string | null = null;

    if (targetTimeSec && distKm > 0) {
      zones = estimateZones(targetTimeSec, distKm);
      const pSec = targetTimeSec / distKm;
      const mm   = Math.floor(pSec / 60);
      const ss   = Math.round(pSec % 60).toString().padStart(2, '0');
      targetPace = `${mm}:${ss}/km`;
    } else if (storedZones?.z1_sec_km && storedZones?.z4_sec_km && storedZones?.z5_sec_km) {
      zones = {
        z1:   secToMinStr(storedZones.z1_sec_km),
        z4:   secToMinStr(storedZones.z4_sec_km),
        z5:   secToMinStr(storedZones.z5_sec_km),
        race: secToMinStr(storedZones.z4_sec_km),
      };
    }

    // ── Periodization ───────────────────────────────────────────
    const totalDays  = Math.round((raceDate.getTime() - startDate.getTime()) / 86400000) + 1;
    const totalWeeks = Math.ceil(totalDays / 7);
    const taperWeeks = totalWeeks >= 8 ? 2 : 1;
    const phases     = computePhases(totalWeeks);

    const peakLongRun = distKm >= 42 ? '32km' : distKm >= 21 ? '20km' : distKm >= 10 ? '15km' : '12km';

    // ── Prompt construction ─────────────────────────────────────
    const zonesBlock = zones
      ? `ZONAS DE ENTRENAMIENTO (Riegel formula, basadas en objetivo ${targetPace}):
  • Z1 Fácil/Aeróbico: ${zones.z1} — conversacional, puedes cantar; VT1
  • Z4 Umbral (LT2):   ${zones.z4} — ritmo 10k aprox; respiración rítmica controlada
  • Z5 VO2max:         ${zones.z5} — ritmo 5k aprox; muy exigente, 9-10 RPE
  • Ritmo objetivo:    ${zones.race}`
      : 'Sin ritmo objetivo. Usar RPE: Z1=5/10, Z4=8/10, Z5=9-10/10.';

    const phasesBlock = phases.map(p =>
      `  • ${p.name.toUpperCase()} (sem ${p.startWeek}→${p.endWeek}): ${p.rule}`
    ).join('\n');

    const methodologyBlock =
      methodology === 'norwegian'
        ? `MÉTODO NORUEGO (Marius Bakken / Ingebrigtsen — adaptado a runner popular):
  PRINCIPIO: 2 sesiones de umbral por semana, TODO lo demás en Z1 estricto.
  • Martes: 4-8 × 1000-2000m a ${zones?.z4 || 'ritmo 10k'}, recup 90-120s trote
  • Jueves: 5-8 × 1000m a ${zones?.z4 || 'ritmo 10k'}, recup 90s trote (sesión algo más fácil)
  • Resto: Z1 ESTRICTO a ${zones?.z1 || 'ritmo muy suave'} — cero "moderado", cero Z3
  • Fase BASE: sin umbral, solo Z1 hasta base consolidada
  • Taper: reducir repeticiones al 50%, mantener mismos ritmos`
        : methodology === 'classic'
        ? `PERIODIZACIÓN CLÁSICA (pirámide de intensidad):
  • Martes: series/intervalos en Z5 (VO2max)
  • Jueves: tempo en Z4 (umbral)
  • Domingo: rodaje largo en Z1
  • Resto: rodajes suaves Z1-Z2
  • Incremento lineal de volumen, descarga cada 4ª semana`
        : `MÉTODO POLARIZADO (Stephen Seiler — evidencia científica de élite):
  PRINCIPIO CLAVE: 80% del VOLUMEN en Z1 puro, 20% en Z4-Z5. Eliminar Z3 completamente.
  • Máximo 2 sesiones de calidad por semana, NUNCA en días consecutivos (48h mínimo)
  • Tipo A — VO2max (Z5): 4-8 × 3-5min a ${zones?.z5 || 'ritmo 5k'}, recuperación activa igual al esfuerzo
  • Tipo B — Umbral (Z4): 2-4 × 10-15min a ${zones?.z4 || 'ritmo 10k'}, recup 3min trote suave
  • Rodaje LARGO: siempre en Z1 (${zones?.z1 || 'conversacional'}), cuenta como volumen base, NO como calidad
  • Rodajes suaves: ${zones?.z1 || 'ritmo conversacional'} — si tienes dudas sobre el ritmo, ve más lento
  • Fase BASE: CERO sesiones de calidad, 100% Z1, construir aerobic engine
  • Taper: 1 sola sesión corta de calidad/sem, el resto Z1`;

    const strengthPromptBlock = includeStrength ? `

METODOLOGÍA DE FUERZA RUNNING-SPECIFIC (${strengthDays} sesión/es por semana, ~60min):
  Base científica: Støren et al. 2008 (+8% economía carrera con HRT), Ramírez-Campillo et al. 2014 (+4% con pliometría), Hoff & Helgerud 2002.

  Periodización obligatoria por fase:
  • BASE → cargas excéntricas lentas (4s bajando). Ejercicios: RDL excéntrico 4×5, sentadilla búlgara excéntrica 3×8/pierna, curl nórdico excéntrico 3×5, calf raises excéntricos 3×12/pierna. ~60min.
  • DESARROLLO → fuerza máxima >80% 1RM, 4-5 reps, 3-4min descanso. Ejercicios: RDL pesado 4×4, búlgara pesada 4×5/pierna, box jump bajo 3×5. ~60min.
  • ESPECÍFICO → pliometría. Ejercicios: box jump 4×5, pogos de tobillo 4×12, broad jump monopodal 4×4/pierna. ~55min.
  • TAPER → mantenimiento, volumen -40%, mismas cargas. ~35min.
` : '';

    const developerInstructions = `Eres un entrenador de running de alto rendimiento con base científica. Devuelve SOLO JSON válido, sin ningún texto antes o después.

FORMATO DE SALIDA OBLIGATORIO:
{"plan":[{"date":"YYYY-MM-DD","description":"descripción concisa ejecutable","explanation":{"type":"series|umbral|tempo|largo|suave|descanso|fuerza","purpose":"objetivo fisiológico concreto","details":"instrucciones paso a paso de ejecución","intensity":"zona y ritmo objetivo concreto o null para descanso","phase":"base|desarrollo|especifico|taper"}}]}

PARÁMETROS DEL PLAN:
  • Período: ${startISO} → ${raceISO} (${totalWeeks} semanas)
  • Días de running por semana: ${runDays}
  • Entrenamiento de fuerza: ${includeStrength ? `sí, ${strengthDays} días/sem` : 'no'}
  • Distancia de la carrera objetivo: ${distKm ? distKm + ' km' : 'no especificada'}
  • Objetivo del atleta: ${goal}
  • Marca previa: ${lastRace?.distance_km ? `${lastRace.distance_km}km en ${lastRace.time || '?'}` : 'no disponible'}
  • Ritmo objetivo de carrera: ${targetPace || 'no definido'}

${zonesBlock}

FASES DE PERIODIZACIÓN:
${phasesBlock}

${methodologyBlock}

REGLAS OBLIGATORIAS — INCUMPLIR ESTAS REGLAS INVALIDA EL PLAN:
  1. SEMANAS DE DESCARGA: cada 4ª semana reducir volumen total un 25-30% (regla 3:1 carga/descarga)
  2. TAPER: últimas ${taperWeeks} semanas → volumen −40-50%, mantener intensidades breves, frescura máxima
  3. DÍAS CONSECUTIVOS DE CALIDAD: PROHIBIDO. Siempre 48h+ entre sesiones de series/umbral/tempo
  4. DÍA DE CARRERA: día de la carrera = competición; día anterior = descanso; semana de carrera volumen muy reducido
  5. VOLUMEN MÁXIMO RODAJE LARGO: no superar ${peakLongRun} en ningún momento del plan
  6. PROGRESIÓN VOLUMEN: no incrementar más del 10% de volumen total respecto a semana anterior (excepto semanas de descarga)
  7. TODAS las sesiones deben tener explanation completa con phase asignada correctamente
  8. Los rodajes suaves SIEMPRE en Z1 (${zones?.z1 || 'ritmo conversacional'}), nunca "moderado"

NOMENCLATURA DE DESCRIPTIONS:
  • Rodaje suave Xkm — fácil Z1
  • Series N×Xmin o N×Xm — intervalos VO2max
  • Umbral N×Xm o Xkm umbral — threshold LT2
  • Tempo Xkm — tempo continuo Z4
  • Largo Xkm — rodaje largo Z1
  • Fuerza (descripción breve) — gimnasio/funcional
  • Descanso — recuperación total

Nada de texto fuera del JSON. El JSON debe ser parseable directamente.${strengthPromptBlock}`;

    const userPrompt = `Carrera objetivo: ${race.name}
Distancia: ${distKm || 'No especificada'} km
Fecha de carrera: ${raceISO}
Objetivo del atleta: ${goal}
Metodología de entrenamiento: ${methodology}
Días disponibles para correr: ${runDays}/semana
Fuerza adicional: ${includeStrength ? strengthDays + ' días/sem' : 'no'}
Marca previa: ${lastRace?.distance_km ? `${lastRace.distance_km}km en ${lastRace.time || '-'}` : 'no'}
Ritmo objetivo: ${targetPace || 'no definido'}
Semanas totales hasta carrera: ${totalWeeks}
Genera el plan completo desde ${startISO} hasta ${raceISO}.`;

    // ── OpenAI API call ─────────────────────────────────────────
    async function callResponsesAPI(activeModel: string): Promise<string> {
      const payload = {
        model: activeModel,
        input: [
          { role: 'developer', content: developerInstructions },
          { role: 'user', content: userPrompt },
        ],
      };

      const res = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const raw = await res.text();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let data: any = null;
      try { data = JSON.parse(raw); } catch { /* keep raw */ }
      if (!res.ok) throw new Error(data?.error?.message || `OpenAI fallo (${res.status})`);

      const outputs: string[] = [];
      if (Array.isArray(data?.output)) {
        for (const item of data.output) {
          if (item?.content && Array.isArray(item.content)) {
            for (const c of item.content) {
              if (c.type === 'output_text' && typeof c.text === 'string') outputs.push(c.text);
            }
          }
        }
      }
      const combined = outputs.join('\n').trim();
      if (!combined) throw new Error('Respuesta OpenAI vacía');
      return combined;
    }

    // ── Type classifier ─────────────────────────────────────────
    function classify(desc: string): string {
      const d = desc.toLowerCase();
      if (d.includes('series') || d.includes('fartlek') || /\dx\d/.test(d) || /\d×\d/.test(d)) return 'series';
      if (d.includes('umbral')) return 'umbral';
      if (d.includes('tempo'))  return 'tempo';
      if (d.includes('largo'))  return 'largo';
      if (d.includes('descanso') || d.includes('rest')) return 'descanso';
      if (d.includes('fuerza')) return 'fuerza';
      return 'suave';
    }

    // ── Fallback plan builder ───────────────────────────────────
    function buildFallbackPlan(): { plan: PlanDay[] } {
      const days: PlanDay[] = [];
      const start    = new Date(startISO + 'T00:00:00Z');
      const end      = new Date(raceISO  + 'T00:00:00Z');
      const startDow = startDate.getUTCDay();

      const wdFor    = (dow: number) => (dow - startDow + 7) % 7;
      const sundayWd   = wdFor(0);
      const tuesdayWd  = wdFor(2);
      const thursdayWd = wdFor(4);
      const saturdayWd = wdFor(6);

      for (let w = 0; w < totalWeeks; w++) {
        const weekNum        = w + 1;
        const phase          = phaseForWeek(phases, weekNum);
        const isRecoveryWeek = weekNum > 1 && weekNum % 4 === 0;
        const isTaper        = phase.name === 'taper';
        const isBase         = phase.name === 'base';

        const volScale = isRecoveryWeek ? 0.72 : isTaper ? 0.55 : 1.0;
        const peakWeek = Math.max(1, totalWeeks - taperWeeks - 1);
        const prog     = Math.min(w / peakWeek, 1.0);

        const maxLongKm = distKm >= 42 ? 32 : distKm >= 21 ? 20 : distKm >= 10 ? 15 : 12;
        const longRunKm = Math.round((9 + prog * (maxLongKm - 9)) * volScale);
        const easyKm    = Math.round((5 + prog * 4) * volScale);

        const hasQuality = !isBase;
        const qualReps1  = Math.round((4 + prog * 4) * volScale);
        const qualReps2  = Math.round((4 + prog * 4) * volScale);

        interface DayPlan { desc: string; type: string; purpose: string; details: string; intensity: string | null }
        const dayPlans: Record<number, DayPlan> = {};

        const qualDays: number[] = [];
        if (hasQuality) {
          qualDays.push(tuesdayWd);
          if (methodology === 'norwegian' || (runDays >= 4 && phase.name !== 'base')) {
            qualDays.push(thursdayWd);
          }
        }
        const runDaySet = new Set<number>([...qualDays, sundayWd]);
        const fillOrder = [wdFor(1), wdFor(3), wdFor(5), wdFor(6), wdFor(0), wdFor(2), wdFor(4)];
        for (const wd of fillOrder) {
          if (runDaySet.size >= runDays) break;
          if (!runDaySet.has(wd)) runDaySet.add(wd);
        }

        for (const wd of Array.from(runDaySet)) {
          if (wd === sundayWd) {
            dayPlans[wd] = {
              desc: `Largo ${longRunKm}km`,
              type: 'largo',
              purpose: 'Resistencia aeróbica, eficiencia metabólica y adaptación muscular',
              details: `${longRunKm}km completamente en Z1 (${zones?.z1 || 'ritmo conversacional'}). Hidrata cada 20-25min. Mantén el ritmo constante y cómodo.`,
              intensity: zones?.z1 ?? 'Z1 — conversacional',
            };
          } else if (wd === tuesdayWd && hasQuality) {
            if (methodology === 'norwegian') {
              dayPlans[wd] = {
                desc: `Umbral ${qualReps1}×1000m`,
                type: 'umbral',
                purpose: 'Desarrollo del umbral anaeróbico (LT2, ~4mmol lactato)',
                details: `Calentamiento 15min Z1. ${qualReps1}×1000m a ${zones?.z4 || 'ritmo 10k'}. Recuperación 90-120s al trote suave. Enfriamiento 10min Z1.`,
                intensity: zones?.z4 ?? 'Z4 — umbral LT2',
              };
            } else {
              dayPlans[wd] = {
                desc: `Series ${qualReps1}×4min`,
                type: 'series',
                purpose: 'Desarrollo del VO2max y economía de carrera',
                details: `Calentamiento 15min Z1. ${qualReps1}×4min a ${zones?.z5 || 'ritmo 5k'} con recuperación activa de 4min al trote. Enfriamiento 10min Z1.`,
                intensity: zones?.z5 ?? 'Z5 — VO2max',
              };
            }
          } else if (wd === thursdayWd && hasQuality && qualDays.includes(thursdayWd)) {
            if (methodology === 'norwegian') {
              dayPlans[wd] = {
                desc: `Umbral ${qualReps2}×1000m`,
                type: 'umbral',
                purpose: '2ª sesión de umbral semanal — método noruego doble umbral',
                details: `Calentamiento 15min Z1. ${qualReps2}×1000m a ${zones?.z4 || 'ritmo 10k'}. Recuperación 90s trote. Enfriamiento 10min Z1.`,
                intensity: zones?.z4 ?? 'Z4 — umbral LT2',
              };
            } else {
              const tempoKm = Math.round((4 + prog * 6) * volScale);
              dayPlans[wd] = {
                desc: `Tempo ${tempoKm}km`,
                type: 'tempo',
                purpose: 'Umbral aeróbico, eficiencia a ritmo de competición',
                details: `Calentamiento 10min Z1. ${tempoKm}km continuos a ${zones?.z4 || 'ritmo 10k-HM'}. Enfriamiento 10min Z1.`,
                intensity: zones?.z4 ?? 'Z4 — tempo',
              };
            }
          } else {
            const km = Math.max(4, Math.round(easyKm * (wd === saturdayWd ? 0.85 : 1.0)));
            dayPlans[wd] = {
              desc: `Rodaje suave ${km}km`,
              type: 'suave',
              purpose: 'Base aeróbica, recuperación activa y adaptación músculo-esquelética',
              details: `${km}km en Z1 a ${zones?.z1 || 'ritmo conversacional'}. Mantén una conversación fluida en todo momento.`,
              intensity: zones?.z1 ?? 'Z1 — fácil',
            };
          }
        }

        if (includeStrength && strengthDays > 0) {
          let added = 0;
          for (let wd = 0; wd < 7 && added < strengthDays; wd++) {
            if (!dayPlans[wd]) {
              const sData = strengthSession(phase.name, added + 1, isRecoveryWeek, isTaper, distKm);
              dayPlans[wd] = { desc: sData.desc, type: 'fuerza', purpose: sData.purpose, details: sData.details, intensity: null };
              added++;
            }
          }
        }

        for (let wd = 0; wd < 7; wd++) {
          if (!dayPlans[wd]) {
            dayPlans[wd] = {
              desc: 'Descanso',
              type: 'descanso',
              purpose: 'Supercompensación — es donde mejoras realmente',
              details: 'Día de descanso activo: paseo suave, movilidad o estiramientos ligeros.',
              intensity: null,
            };
          }
        }

        for (let wd = 0; wd < 7; wd++) {
          const date = new Date(start.getTime() + (w * 7 + wd) * 86400000);
          if (date > end) break;
          const p = dayPlans[wd];
          days.push({
            date: date.toISOString().split('T')[0],
            description: p.desc,
            explanation: {
              type:      p.type,
              purpose:   p.purpose,
              details:   p.details,
              intensity: p.intensity,
              phase:     phase.name,
            },
          });
        }
      }

      return { plan: days };
    }

    // ── Try OpenAI, fall back to algorithmic plan ───────────────
    let rawContent: string | null = null;
    let openAiError: string | null = null;
    let usedModel: string | null = null;
    const candidateModels = [model, 'gpt-4o-mini', 'gpt-4o'];

    for (const m of candidateModels) {
      try {
        rawContent = await callResponsesAPI(m);
        usedModel  = m;
        break;
      } catch (err) {
        openAiError = (err as Error).message;
      }
    }

    let parsedPlan: { plan: PlanDay[] } | null = null;
    if (rawContent) {
      const first = rawContent.indexOf('{');
      const last  = rawContent.lastIndexOf('}');
      if (first !== -1 && last !== -1 && last > first) {
        try { parsedPlan = JSON.parse(rawContent.slice(first, last + 1).trim()); }
        catch { /* ignore */ }
      }
    }

    if (!parsedPlan || !parsedPlan.plan || !Array.isArray(parsedPlan.plan)) {
      parsedPlan = buildFallbackPlan();
      if (!usedModel) usedModel = `fallback-${methodology}`;
    }

    // Validate and fill missing explanations
    parsedPlan.plan.forEach(d => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date))      throw new HttpsError('internal', `Fecha inválida en plan: ${d.date}`);
      if (typeof d.description !== 'string')          throw new HttpsError('internal', 'Descripción inválida en un día');
      if (!d.explanation || typeof d.explanation !== 'object') {
        const type = classify(d.description);
        d.explanation = { type, purpose: 'Entrenamiento', details: d.description };
      }
    });

    return {
      ...parsedPlan,
      meta: {
        fallback:   !rawContent || usedModel?.startsWith('fallback'),
        openAiError,
        model:      usedModel,
        methodology,
        zones,
        phases: phases.map(p => ({ name: p.name, startWeek: p.startWeek, endWeek: p.endWeek })),
      },
    };
  }
);
