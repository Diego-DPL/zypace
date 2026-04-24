// Tipos runtime Supabase
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
// @ts-ignore Tipos Deno resueltos en runtime Supabase
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const Deno: any;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RacePayload {
  id?: number | string;
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

interface PlanResponse {
  plan: PlanDay[];
}

// ═══════════════════════════════════════════════════════════════
// ZONES — Seiler & Tønnessen (2009), Riegel formula
// ═══════════════════════════════════════════════════════════════

function secToMinStr(s: number): string {
  const mm = Math.floor(s / 60);
  const ss = Math.round(s % 60).toString().padStart(2, '0');
  return `${mm}:${ss}/km`;
}

interface TrainingZones {
  z1: string;   // Easy aerobic — VT1, conversational
  z4: string;   // Threshold LT2 — ~10k race pace
  z5: string;   // VO2max — ~5k race pace
  race: string; // Target race pace
}

/**
 * Estimates training zones using Riegel's race-time formula.
 * Multipliers derived from Seiler & Tønnessen (2009) polarized model.
 */
function estimateZones(targetTimeSec: number, distKm: number): TrainingZones | null {
  if (!targetTimeSec || !distKm || distKm <= 0 || targetTimeSec <= 0) return null;
  // Normalize to 10k equivalent: T2 = T1 × (D2/D1)^1.06
  const t10k = targetTimeSec * Math.pow(10 / distKm, 1.06);
  const p10k = t10k / 10; // sec/km at 10k effort
  return {
    z1:   secToMinStr(p10k * 1.28), // +28% vs 10k: truly easy, VT1
    z4:   secToMinStr(p10k * 1.02), // ≈10k pace: lactate threshold LT2
    z5:   secToMinStr(p10k * 0.90), // -10% vs 10k: VO2max, ~5k pace
    race: secToMinStr(targetTimeSec / distKm),
  };
}

// ═══════════════════════════════════════════════════════════════
// PERIODIZATION — mesocycles with base/development/specific/taper
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
      { name: 'base',       startWeek: 1,                    endWeek: 6,                    rule: 'Solo Z1. Sin sesiones de calidad. Construir hábito aeróbico. Descarga semana 4.' },
      { name: 'desarrollo', startWeek: 7,                    endWeek: totalWeeks - 4,        rule: '1-2 sesiones calidad/sem (Z4-Z5). Descarga cada 4ª semana (−25% volumen).' },
      { name: 'especifico', startWeek: totalWeeks - 3,       endWeek: totalWeeks - 2,        rule: 'Trabajo a ritmo de carrera. Volumen pico. 2 sesiones calidad/sem.' },
      { name: 'taper',      startWeek: totalWeeks - 1,       endWeek: totalWeeks,            rule: 'Volumen −45%. Mantener 1 sesión corta de intensidad. Frescura máxima.' },
    ];
  }
  if (totalWeeks >= 10) {
    const taper = 2, spec = 2;
    const rest  = totalWeeks - taper - spec;
    const base  = Math.max(2, Math.floor(rest * 0.45));
    return [
      { name: 'base',       startWeek: 1,                              endWeek: base,                      rule: 'Solo Z1. Sin calidad. Base aeróbica. Descarga semana 4 si aplica.' },
      { name: 'desarrollo', startWeek: base + 1,                       endWeek: totalWeeks - taper - spec, rule: '1-2 sesiones calidad/sem. Descarga cada 4ª semana (−25%).' },
      { name: 'especifico', startWeek: totalWeeks - taper - spec + 1,  endWeek: totalWeeks - taper,        rule: 'Sesiones a ritmo de carrera. Calidad prioritaria.' },
      { name: 'taper',      startWeek: totalWeeks - taper + 1,         endWeek: totalWeeks,                rule: 'Volumen −40-50%. Activación pre-carrera.' },
    ];
  }
  if (totalWeeks >= 6) {
    return [
      { name: 'base',       startWeek: 1,               endWeek: 2,               rule: 'Rodajes fáciles Z1. Sin calidad. Adaptación.' },
      { name: 'desarrollo', startWeek: 3,               endWeek: totalWeeks - 2,  rule: '1 sesión calidad/sem.' },
      { name: 'taper',      startWeek: totalWeeks - 1,  endWeek: totalWeeks,      rule: 'Reducir volumen 35-40%.' },
    ];
  }
  if (totalWeeks >= 3) {
    return [
      { name: 'desarrollo', startWeek: 1,            endWeek: totalWeeks - 1, rule: '1 sesión calidad/sem, resto Z1.' },
      { name: 'taper',      startWeek: totalWeeks,   endWeek: totalWeeks,     rule: 'Activación: rodaje suave + strides breves.' },
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
//
// References:
//   Støren et al. (2008) — HRT +8% running economy
//   Ramírez-Campillo et al. (2014) — plyometrics +4% running economy
//   Hoff & Helgerud (2002) — heavy strength > endurance strength for runners
//   Balsalobre-Fernández et al. (2021) — eccentric loading for tendon resilience
//
// Periodization:
//   BASE     → slow eccentrics (4s) → build tendons, neuromuscular patterns
//   DESARROLLO → heavy 80-85% 1RM, 4×4-5 reps → max neural recruitment
//   ESPECÍFICO → plyometrics (box jump, pogos, bounds) → elastic energy conversion
//   TAPER    → maintenance -40% volume, same intensity
//
// Session rotation (up to 3/week):
//   S1 → posterior chain heavy (RDL, Bulgarian, Nordic)
//   S2 → explosive + upper support (hip thrust, box jump, rowing/core)
//   S3 → single-leg + lateral stability (trail-specific)

interface StrengthSessionData { desc: string; purpose: string; details: string; }

function strengthSession(
  phaseName: string,
  sessionNum: number,   // 1, 2, or 3 within the week
  isRecovery: boolean,
  isTaper:    boolean,
  distKm:     number,
): StrengthSessionData {
  const isTrail = distKm === 0 || distKm > 21; // trail or unspecified → include lateral/stability extras

  // ── TAPER ──────────────────────────────────────────────────────
  if (isTaper) return {
    desc: 'Fuerza mantenimiento pre-carrera',
    purpose: 'Mantener adaptaciones neuromusculares sin acumular fatiga. Volumen -40%, mismas cargas.',
    details: `Sesión ~35min. Reducir series al 60%, no bajar las cargas.
BLOQUE A: Peso muerto rumano 3×4 (carga habitual, excéntrico 2s) · Sentadilla búlgara 2×4/pierna
BLOQUE B: Hip thrust 3×5 explosivo · Calf raise excéntrico 2×8/pierna
BLOQUE C (8min core): Plancha frontal 2×30s · Pallof press 2×8/lado
Sin pliometría. Finaliza con 5min movilidad de cadera y tobillo.`,
  };

  // ── RECOVERY WEEK ──────────────────────────────────────────────
  if (isRecovery) return {
    desc: 'Fuerza descarga semanal',
    purpose: 'Semana de descarga: -30% volumen, -20% carga. Mantener patrones neuromusculares.',
    details: `Sesión ~40min.
BLOQUE A: Peso muerto rumano 3×5 (carga -20%, técnica perfecta) · Zancada búlgara 2×6/pierna
BLOQUE B: Curl nórdico 2×4 (asistido si es necesario) · Hip thrust 3×8 (carga ligera)
BLOQUE C (10min): Plancha frontal 2×30s · Plancha lateral 2×20s/lado · Bird-dog 2×8/lado
Sin ejercicios explosivos esta semana.`,
  };

  // ── BASE ───────────────────────────────────────────────────────
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
      purpose: 'Sesión complementaria de base: core profundo, tracción dorsal y estabilidad de hombro para la postura de carrera. Un core fuerte mejora la transferencia de fuerza en cada zancada y reduce el coste energético.',
      details: `Sesión ~55min. Énfasis en core funcional, postura y estabilización global.

BLOQUE A — Tracción y postura (20min):
  • Remo con mancuerna unilateral: 4×8/lado | espalda plana, codo atrás | 1.5min descanso
  • Face pull con banda: 3×15 | retracción escapular | 1min descanso | contrarresta encorvamiento en carrera larga
  • Superman con pausa 2s: 3×10 | extensores de espalda baja

BLOQUE B — Core funcional (20min):
  • Plancha frontal con toques de hombro: 3×16 (8/lado) | cadera estable, sin rotación
  • Plancha lateral con elevación de cadera: 3×10/lado
  • Dead bug: 3×10/lado | LENTO, lumbar pegada al suelo siempre
  • Farmer's carry unilateral: 3×20m/lado | core anti-flexión lateral | fundamental para trail

BLOQUE C — Glúteo e isquios (12min):
  • Hip Thrust con barra o mancuerna: 4×10 (carga moderada) | pausa 1s arriba
  • Good morning con barra ligera: 3×12 | cadena posterior, excelente transferencia al running

Calentamiento 5min: foam roller toráxico + movilidad de hombros.`,
    };
    // sessionNum >= 3
    return {
      desc: 'Fuerza base S3 — single-leg y estabilidad lateral',
      purpose: 'Tercera sesión de base: fuerza unilateral y estabilidad lateral para terreno irregular. Previene esguinces de tobillo y mejora el control en descensos de trail.',
      details: `Sesión ~55min. Single-leg dominante + estabilidad lateral.

BLOQUE A — Single-leg (22min):
  • Step-up con mancuernas (cajón a altura de rodilla): 4×8/pierna | control excéntrico en bajada | 2min descanso
  • Zancada reverse con mancuernas: 3×8/pierna | pie delantero fijo, rodilla trasera roza suelo | 1.5min descanso
  • Sentadilla monopodal asistida con TRX: 3×6/pierna | rodilla sobre pie | 2min descanso

BLOQUE B — Estabilidad lateral y abductores (15min):
  • Lateral band walk con mini-banda: 3×15 pasos/lado | abductores de cadera, previene síndrome IT
  • Clamshell con banda: 3×15/lado | glúteo medio
  • Step-down excéntrico lateral (desde cajón bajo, bajando hacia el lado): 3×8/pierna | simula descenso de trail

BLOQUE C — Tobillo y Achilles (10min):
  • Calf raise monopodal en step (excéntrico 3s): 3×12/pierna | salud del tendón de Aquiles
  • Equilibrio monopodal con movimiento de brazos: 3×30s/pierna
  • Tibial anterior raises: 2×15 | previene periostitis tibial

Calentamiento 8min: movilidad tobillo + banda de cadera.`,
    };
  }

  // ── DESARROLLO ─────────────────────────────────────────────────
  if (phaseName === 'desarrollo') {
    if (sessionNum === 1) return {
      desc: 'Fuerza desarrollo S1 — fuerza máxima neuromuscular',
      purpose: 'Reclutamiento neuromuscular máximo con cargas >80% 1RM. Støren et al. (2008): 8 semanas de heavy resistance training (HRT) → +8% economía de carrera en corredores de fondo. El objetivo es activar el máximo de fibras musculares, NO la hipertrofia.',
      details: `Sesión ~60min. Cargas altas, pocas reps, descanso COMPLETO entre series.

BLOQUE A — Fuerza máxima (25min):
  • Peso muerto rumano (80-85% 1RM): 4×4 reps | excéntrico 2s, concéntrico EXPLOSIVO | 3-4min descanso | ⭐ el ejercicio más transferible al running según la literatura
  • Sentadilla búlgara con mancuernas pesadas: 4×5/pierna | progresión de carga cada semana | 2.5min descanso

BLOQUE B — Potencia inicial (15min):
  • Step-up explosivo con mancuernas (banco a rodilla): 3×6/pierna | bajada controlada, subida máxima potencia | 2min descanso
  • Box jump bajo (40cm): 3×5 | aterrizaje SUAVE y silencioso, máxima potencia de salida | 2.5min descanso

BLOQUE C — Isquiotibiales y core (15min):
  • Curl nórdico (forma completa, asistido si es necesario): 3×5 | 2.5min descanso
  • Hip Thrust con barra (carga alta): 4×5 | extensión completa, pausa 1s | 2min descanso
  • Plancha lateral con elevación de cadera: 3×10/lado

Calentamiento 8min: foam roller quads/isquios + activación glúteo con barra ligera.`,
    };
    if (sessionNum === 2) return {
      desc: 'Fuerza desarrollo S2 — potencia explosiva y core',
      purpose: 'Sesión 2 de desarrollo: fuerza explosiva y core de alta demanda. Complementa la sesión de fuerza máxima sin solapar grupos principales. La tracción pesada mejora la eficiencia de brazos en running.',
      details: `Sesión ~60min. Fuerza explosiva + tracción pesada + core intenso.

BLOQUE A — Fuerza explosiva de cadera (20min):
  • Hip Thrust explosivo con barra (75-80% 1RM): 4×5 | extensión de cadera lo más RÁPIDA posible (<0.3s) | 2.5min descanso
  • Jump squat (sentadilla con salto, 20-30% 1RM): 4×4 | máxima altura | 3min descanso | mejora la fase de propulsión de la zancada
  • Plyo calf raise (elevación de talón con salto): 3×8 | 2min descanso

BLOQUE B — Tracción pesada (15min):
  • Dominada o jalón al pecho con carga progresiva: 4×5 | 2.5min descanso | eficiencia de brazos + postura de trail con bastones
  • Remo con barra (Pendlay row): 3×6 | espalda recta, explosivo | 2min descanso

BLOQUE C — Core de alta intensidad (15min):
  • Ab wheel rollout: 3×8 | LENTO, lumbar neutral | 1.5min descanso
  • Pallof press pesado: 3×10/lado
  • Hollow body hold: 3×20s | tensión abdominal máxima
${isTrail ? '  • Lateral bound (salto lateral a una pierna): 3×5/lado | potencia lateral para trail' : '  • Scissors (tijeras lentas): 3×15/lado | core bajo'}

Calentamiento 8min: movilidad torácica + hip circles dinámicos.`,
    };
    // sessionNum >= 3
    return {
      desc: 'Fuerza desarrollo S3 — single-leg pesado e isquios',
      purpose: 'Sesión 3 de desarrollo: carga máxima unilateral + trabajo específico de isquios. La asimetría de fuerza entre piernas es el predictor #1 de lesiones en runners. Esta sesión la corrige con ejercicios monopodal pesados.',
      details: `Sesión ~60min. Unilateral pesado + isquios específico.

BLOQUE A — Single-leg pesado (25min):
  • RDL monopodal con mancuerna (mano contraria): 4×5/pierna | excéntrico controlado | 2.5min descanso | máxima transferencia a la zancada + equilibrio
  • Sentadilla monopodal completa (pistol squat con TRX): 4×5/pierna | carga progresiva | 2.5min descanso

BLOQUE B — Isquiotibiales específico (20min):
  • Curl nórdico (4×5): máxima excéntrica, asistido si es necesario | 3min descanso
  • Good morning pesado: 4×6 | 2min descanso
  • Glute-ham raise (si hay máquina) o SL hip hinge: 3×8/pierna | 2min descanso

BLOQUE C — Tobillo y estabilidad (10min):
  • Calf raise monopodal en step (excéntrico 3s): 3×12/pierna
  • Equilibrio monopodal sobre bosu: 3×30s/pierna
${isTrail
  ? '  • Step-down lateral excéntrico desde cajón (60cm): 3×8/pierna | control de descenso trail'
  : '  • Tibial anterior raises: 2×15 | prevención periostitis'}

Calentamiento 8min.`,
    };
  }

  // ── ESPECÍFICO ─────────────────────────────────────────────────
  if (phaseName === 'especifico') {
    if (sessionNum === 1) return {
      desc: 'Fuerza específico S1 — pliometría alta intensidad',
      purpose: 'Convertir la fuerza en velocidad de ciclo. Ramírez-Campillo et al. (2014): 6 semanas de pliometría → +4% economía de carrera SIN cambio en VO2max. Barnes & Kilding (2015): reduce tiempo de contacto con el suelo → más eficiencia en cada zancada.',
      details: `Sesión ~55min. Alta potencia: descanso COMPLETO entre series (calidad > cantidad).

BLOQUE A — Pliometría alta intensidad (25min):
  • Box jump (50-60cm): 4×5 | máxima potencia, aterrizaje SUAVE y silencioso | 3min descanso total | mejora la fase de propulsión de la zancada
  • Salto monopodal horizontal (single-leg broad jump): 4×4/pierna | aterrizaje estable y controlado | 2.5min descanso
  • Pogos de tobillo (ankle pogos): 4×12 contactos | mínimo tiempo de contacto, tobillo RÍGIDO | 2min descanso | mejora el ciclo acortamiento-estiramiento: el mecanismo de eficiencia de los runners élite

BLOQUE B — Fuerza explosiva de cadera (15min):
  • Hip Thrust explosivo con barra (carga alta): 4×4 | extensión de cadera en <0.2s | 3min descanso
  • Jump lunge (zancada con salto): 3×5/pierna | cambio explosivo | 2.5min descanso

BLOQUE C — Tendón y tobillo (10min):
  • Curl nórdico mantenimiento: 3×4
  • Calf raise isométrico (en punta de pie, 3×20s): prepara el tendón de Aquiles para la carrera
${isTrail ? '  • Salto lateral a cajón (lateral box jump): 3×5/lado | potencia de cambio de dirección en trail' : ''}

Calentamiento 10min: saltos de tobillo, skipping A y B, movilidad dinámica de cadera.`,
    };
    if (sessionNum === 2) return {
      desc: 'Fuerza específico S2 — pliometría resistencia y velocidad',
      purpose: 'Pliometría de resistencia y control excéntrico a alta velocidad. Entrena la capacidad de repetir ciclos de potencia — crucial para mantener la eficiencia en las últimas fases de una carrera.',
      details: `Sesión ~55min. Velocidad de fuerza + pliometría de resistencia.

BLOQUE A — Pliometría de resistencia (22min):
  • Bounding (zancadas exageradas con vuelo): 4×20m | máxima longitud de zancada | 3min descanso
  • Saltos continuos sobre vallas bajas (hurdle hops): 4×8 | aterrizaje ELÁSTICO no absorbido | 2.5min descanso
  • Single-leg pogos: 3×10/pierna | 2min descanso

BLOQUE B — Fuerza de velocidad (20min):
  • Sentadilla búlgara EXPLOSIVA (50% 1RM, máxima velocidad concéntrica): 4×5/pierna | 2.5min descanso | potencia específica de la zancada
  • Step-down excéntrico rápido desde cajón (60cm): 3×8/pierna | control de descenso en <1s | 2min descanso | previene síndrome rotuliano en bajadas

BLOQUE C — Tobillo + core final (10min):
  • Drop jump (caer de cajón bajo y saltar inmediatamente): 3×4 | solo si la técnica es perfecta
  • Leg raise (elevación de piernas rectas): 3×12 | core inferior para eficiencia de cadera
  • Tibial raises: 2×15`,
    };
    // sessionNum >= 3
    return {
      desc: 'Fuerza específico S3 — activación y mantenimiento',
      purpose: 'Sesión 3 específica: activación neuromuscular con volumen reducido. Mantener fuerza y potencia sin acumular fatiga excesiva en la semana más intensa del plan.',
      details: `Sesión ~45min (volumen reducido, calidad máxima).

BLOQUE A — Activación neuromuscular (20min):
  • Peso muerto rumano: 3×4 (carga máxima, pocas reps) | 3min descanso
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

  // ── FALLBACK ────────────────────────────────────────────────────
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
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  const requestId = crypto.randomUUID();
  console.log(`[${requestId}] Incoming request`);

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let body: any;
    try { body = await req.json(); } catch { throw new Error('JSON inválido'); }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { race, goal, config } = body as { race?: RacePayload; goal?: string; config?: any };
    console.log(`[${requestId}] Payload`, { race, goal, config });

    if (!race || !goal) throw new Error('Faltan detalles de la carrera o el objetivo.');
    if (!race.date) throw new Error('La carrera no tiene fecha.');

    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) throw new Error('OPENAI_API_KEY no está configurada');

    const model = Deno.env.get('OPENAI_MODEL') || 'gpt-4o';

    const raceDate = new Date(race.date);
    if (isNaN(raceDate.getTime())) throw new Error('Fecha de carrera inválida');

    const today = new Date();
    const startDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    if (startDate > raceDate) throw new Error('La fecha de la carrera ya pasó o es anterior a hoy');

    const startISO = startDate.toISOString().split('T')[0];
    const raceISO  = raceDate.toISOString().split('T')[0];

    // ── Config ─────────────────────────────────────────────────
    const runDays         = Math.min(Math.max(Number(config?.run_days_per_week) || 4, 2), 7);
    const includeStrength = !!config?.include_strength;
    const strengthDays    = includeStrength ? Math.min(Math.max(Number(config?.strength_days_per_week) || 1, 1), 3) : 0;
    const lastRace        = config?.last_race;
    const targetTimeSec   = Number(config?.target_time_seconds) || null;
    const methodology     = (config?.methodology || 'polarized') as 'polarized' | 'norwegian' | 'classic';
    const distKm          = Number(race.distance) || 0;
    // Zonas calibradas del perfil (desde calibrate-zones): se usan cuando no hay tiempo objetivo
    const storedZones     = config?.stored_zones as { z1_sec_km?: number; z4_sec_km?: number; z5_sec_km?: number } | null;

    // ── Zones ───────────────────────────────────────────────────
    // Priority: 1) Riegel from target time (race-specific), 2) Stored profile zones, 3) null
    let zones: TrainingZones | null = null;
    let targetPace: string | null = null;

    if (targetTimeSec && distKm > 0) {
      zones = estimateZones(targetTimeSec, distKm);
      const pSec = targetTimeSec / distKm;
      const mm   = Math.floor(pSec / 60);
      const ss   = Math.round(pSec % 60).toString().padStart(2, '0');
      targetPace = `${mm}:${ss}/km`;
    } else if (storedZones?.z1_sec_km && storedZones?.z4_sec_km && storedZones?.z5_sec_km) {
      // Use calibrated profile zones as reference when no target time is available
      zones = {
        z1:   secToMinStr(storedZones.z1_sec_km),
        z4:   secToMinStr(storedZones.z4_sec_km),
        z5:   secToMinStr(storedZones.z5_sec_km),
        race: secToMinStr(storedZones.z4_sec_km), // best approximation without race-specific target
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

    // Strength block for OpenAI prompt — mirrors the algorithmic periodization
    const strengthPromptBlock = includeStrength ? `

METODOLOGÍA DE FUERZA RUNNING-SPECIFIC (${strengthDays} sesión/es por semana, ~60min):
  Base científica: Støren et al. 2008 (+8% economía carrera con HRT), Ramírez-Campillo et al. 2014 (+4% con pliometría), Hoff & Helgerud 2002.

  Periodización obligatoria por fase:
  • BASE → cargas excéntricas lentas (4s bajando). Ejercicios: RDL excéntrico 4×5, sentadilla búlgara excéntrica 3×8/pierna, curl nórdico excéntrico 3×5, calf raises excéntricos 3×12/pierna, Copenhague plank, pallof press. ~60min. Construye tendones y patrones neuromusculares.
  • DESARROLLO → fuerza máxima >80% 1RM, 4-5 reps, 3-4min descanso. Ejercicios: RDL pesado 4×4, búlgara pesada 4×5/pierna, box jump bajo 3×5, curl nórdico 3×5, hip thrust explosivo 4×5. ~60min.
  • ESPECÍFICO → pliometría. Ejercicios: box jump 4×5, pogos de tobillo 4×12, broad jump monopodal 4×4/pierna, hip thrust explosivo pesado 4×4. ~55min.
  • TAPER → mantenimiento, volumen -40%, mismas cargas. ~35min.

  Si hay ${strengthDays} sesión/es por semana, usar esta rotación:
    S1 = cadena posterior pesada (RDL, búlgara, curl nórdico)
    S2 = explosivo + tracción + core (hip thrust, box jump, remo, core intenso)
    S3 = single-leg + estabilidad lateral (pistol squat, lateral band walk, step-down)

  REGLAS obligatorias para sesiones de fuerza:
  - description: conciso + fase + sesión, ej: "Fuerza base S1 — cadena posterior excéntrica"
  - details: DEBE incluir bloques A/B/C, ejercicio + sets×reps + excéntrico/descanso, duración total
  - Nunca programar fuerza el mismo día que series/umbral/tempo
  - En semanas de descarga (4ª semana): reducir volumen 30%, mantener cargas
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
    async function callResponsesAPI(activeModel: string) {
      const payload = {
        model: activeModel,
        input: [
          { role: 'developer', content: developerInstructions },
          { role: 'user', content: userPrompt }
        ]
      } as Record<string, unknown>;

      const res = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const raw = await res.text();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let data: any = null;
      try { data = JSON.parse(raw); } catch { /* keep raw for error reporting */ }
      if (!res.ok) {
        console.error(`[${requestId}] OpenAI error (${activeModel}) ${res.status}: ${raw.slice(0, 400)}`);
        throw new Error(data?.error?.message || `OpenAI fallo (${res.status})`);
      }
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
      if (d.includes('tempo')) return 'tempo';
      if (d.includes('largo')) return 'largo';
      if (d.includes('descanso') || d.includes('rest')) return 'descanso';
      if (d.includes('fuerza')) return 'fuerza';
      return 'suave';
    }

    // ═══════════════════════════════════════════════════════════
    // FALLBACK PLAN — scientific polarized/norwegian methodology
    // ═══════════════════════════════════════════════════════════
    function buildFallbackPlan(): PlanResponse {
      const days: PlanDay[] = [];
      const start    = new Date(startISO + 'T00:00:00Z');
      const end      = new Date(raceISO + 'T00:00:00Z');
      const startDow = startDate.getUTCDay(); // 0=Sun, 1=Mon … 6=Sat

      // Compute wd offset for a given day-of-week
      const wdFor = (dow: number) => (dow - startDow + 7) % 7;

      // Key day offsets within each 7-day block
      const sundayWd    = wdFor(0); // Long run
      const tuesdayWd   = wdFor(2); // Quality session 1
      const thursdayWd  = wdFor(4); // Quality session 2 (norwegian) or easy/2nd quality
      const saturdayWd  = wdFor(6); // Optional extra easy run

      for (let w = 0; w < totalWeeks; w++) {
        const weekNum         = w + 1;
        const phase           = phaseForWeek(phases, weekNum);
        const isRecoveryWeek  = weekNum > 1 && weekNum % 4 === 0;
        const isTaper         = phase.name === 'taper';
        const isBase          = phase.name === 'base';

        // Volume scaling factors
        const volScale = isRecoveryWeek ? 0.72 : isTaper ? 0.55 : 1.0;

        // Progressive distance factors (0→1 over training period, excluding taper)
        const peakWeek = Math.max(1, totalWeeks - taperWeeks - 1);
        const prog = Math.min(w / peakWeek, 1.0);

        // Base distances
        const maxLongKm = distKm >= 42 ? 32 : distKm >= 21 ? 20 : distKm >= 10 ? 15 : 12;
        const longRunKm = Math.round((9 + prog * (maxLongKm - 9)) * volScale);
        const easyKm    = Math.round((5 + prog * 4) * volScale);

        // Quality session parameters
        const hasQuality = !isBase;
        const qualReps1  = Math.round((4 + prog * 4) * volScale);
        const qualReps2  = Math.round((4 + prog * 4) * volScale);

        // Build day assignments for this week
        interface DayPlan { desc: string; type: string; purpose: string; details: string; intensity: string | null }
        const dayPlans: Record<number, DayPlan> = {};

        // Determine which wd indices get running days (prioritise quality + long run days)
        const qualDays: number[] = [];
        if (hasQuality) {
          qualDays.push(tuesdayWd);
          if (methodology === 'norwegian' || (runDays >= 4 && phase.name !== 'base')) {
            qualDays.push(thursdayWd);
          }
        }
        const longRunDay = sundayWd;
        const runDaySet = new Set<number>([...qualDays, longRunDay]);
        // Fill remaining run days with easy runs
        const fillOrder = [wdFor(1), wdFor(3), wdFor(5), wdFor(6), wdFor(0), wdFor(2), wdFor(4)];
        for (const wd of fillOrder) {
          if (runDaySet.size >= runDays) break;
          if (!runDaySet.has(wd)) runDaySet.add(wd);
        }

        for (const wd of Array.from(runDaySet)) {
          if (wd === longRunDay) {
            // Long run — always Z1
            dayPlans[wd] = {
              desc: `Largo ${longRunKm}km`,
              type: 'largo',
              purpose: 'Resistencia aeróbica, eficiencia metabólica y adaptación muscular',
              details: `${longRunKm}km completamente en Z1 (${zones?.z1 || 'ritmo conversacional'}). Hidrata cada 20-25min. Mantén el ritmo constante y cómodo; si tienes dudas ve más lento.`,
              intensity: zones?.z1 ?? 'Z1 — conversacional'
            };
          } else if (wd === tuesdayWd && hasQuality) {
            // Quality session 1
            if (methodology === 'norwegian') {
              dayPlans[wd] = {
                desc: `Umbral ${qualReps1}×1000m`,
                type: 'umbral',
                purpose: 'Desarrollo del umbral anaeróbico (LT2, ~4mmol lactato)',
                details: `Calentamiento 15min Z1. ${qualReps1}×1000m a ${zones?.z4 || 'ritmo 10k'}. Recuperación 90-120s al trote suave entre repeticiones. Enfriamiento 10min Z1. El ritmo debe ser "comfortably hard", respiración rítmica.`,
                intensity: zones?.z4 ?? 'Z4 — umbral LT2'
              };
            } else {
              // Polarized: VO2max intervals
              dayPlans[wd] = {
                desc: `Series ${qualReps1}×4min`,
                type: 'series',
                purpose: 'Desarrollo del VO2max y economía de carrera',
                details: `Calentamiento 15min Z1. ${qualReps1}×4min a ${zones?.z5 || 'ritmo 5k'} con recuperación activa de 4min al trote. Enfriamiento 10min Z1. Cada repetición debe ser sostenible; si no puedes mantener el ritmo, para.`,
                intensity: zones?.z5 ?? 'Z5 — VO2max'
              };
            }
          } else if (wd === thursdayWd && hasQuality && qualDays.includes(thursdayWd)) {
            // Quality session 2
            if (methodology === 'norwegian') {
              dayPlans[wd] = {
                desc: `Umbral ${qualReps2}×1000m`,
                type: 'umbral',
                purpose: '2ª sesión de umbral semanal — método noruego doble umbral',
                details: `Calentamiento 15min Z1. ${qualReps2}×1000m a ${zones?.z4 || 'ritmo 10k'}. Recuperación 90s trote. Enfriamiento 10min Z1. Ligeramente más fácil que el martes. El método noruego: alto volumen a umbral, TODO lo demás Z1.`,
                intensity: zones?.z4 ?? 'Z4 — umbral LT2'
              };
            } else {
              // Polarized 2nd quality: tempo in development/specific phase
              const tempoKm = Math.round((4 + prog * 6) * volScale);
              dayPlans[wd] = {
                desc: `Tempo ${tempoKm}km`,
                type: 'tempo',
                purpose: 'Umbral aeróbico, eficiencia a ritmo de competición',
                details: `Calentamiento 10min Z1. ${tempoKm}km continuos a ${zones?.z4 || 'ritmo 10k-HM'}. Respiración rítmica y controlada, puedes hablar frases cortas. Enfriamiento 10min Z1. No confundir con Z3 (moderado).`,
                intensity: zones?.z4 ?? 'Z4 — tempo'
              };
            }
          } else {
            // Easy run — Z1 always
            const km = Math.max(4, Math.round(easyKm * (wd === saturdayWd ? 0.85 : 1.0)));
            dayPlans[wd] = {
              desc: `Rodaje suave ${km}km`,
              type: 'suave',
              purpose: 'Base aeróbica, recuperación activa y adaptación músculo-esquelética',
              details: `${km}km en Z1 a ${zones?.z1 || 'ritmo conversacional'}. Mantén una conversación fluida en todo momento. Este ritmo fácil es el BLOQUE más importante de tu entrenamiento — no lo subestimes.`,
              intensity: zones?.z1 ?? 'Z1 — fácil'
            };
          }
        }

        // Strength sessions in free slots — phase-specific, science-backed
        if (includeStrength && strengthDays > 0) {
          let added = 0;
          for (let wd = 0; wd < 7 && added < strengthDays; wd++) {
            if (!dayPlans[wd]) {
              const sData = strengthSession(phase.name, added + 1, isRecoveryWeek, isTaper, distKm);
              dayPlans[wd] = {
                desc:      sData.desc,
                type:      'fuerza',
                purpose:   sData.purpose,
                details:   sData.details,
                intensity: null,
              };
              added++;
            }
          }
        }

        // Fill rest as rest days
        for (let wd = 0; wd < 7; wd++) {
          if (!dayPlans[wd]) {
            dayPlans[wd] = {
              desc: 'Descanso',
              type: 'descanso',
              purpose: 'Supercompensación — es donde mejoras realmente',
              details: 'Día de descanso activo: paseo suave, movilidad o estiramientos ligeros. El descanso es tan importante como el entrenamiento.',
              intensity: null
            };
          }
        }

        // Emit days for this week
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
            }
          });
        }
      }

      return { plan: days };
    }

    // ── Try OpenAI, fall back to algorithmic plan ───────────────
    let rawContent: string | null = null;
    let attempts   = 0;
    let openAiError: string | null = null;
    let usedModel: string | null   = null;
    const candidateModels = [model, 'gpt-4o-mini', 'gpt-4o'];

    for (const m of candidateModels) {
      try {
        attempts++;
        rawContent = await callResponsesAPI(m);
        usedModel  = m;
        console.log(`[${requestId}] OpenAI OK con modelo ${m}`);
        break;
      } catch (err) {
        openAiError = (err as Error).message;
        console.warn(`[${requestId}] Fallo modelo ${m}:`, openAiError);
      }
    }

    let parsedPlan: PlanResponse | null = null;
    if (rawContent) {
      const first = rawContent.indexOf('{');
      const last  = rawContent.lastIndexOf('}');
      if (first !== -1 && last !== -1 && last > first) {
        try { parsedPlan = JSON.parse(rawContent.slice(first, last + 1).trim()); }
        catch (e) { console.error(`[${requestId}] JSON parse fail`, (e as Error).message); }
      }
    }

    if (!parsedPlan || !parsedPlan.plan || !Array.isArray(parsedPlan.plan)) {
      console.log(`[${requestId}] Usando plan fallback científico (${methodology})`);
      parsedPlan = buildFallbackPlan();
      if (!usedModel) usedModel = `fallback-${methodology}`;
    }

    // Validate and fill missing explanations
    parsedPlan.plan.forEach(d => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) throw new Error(`Fecha inválida en plan: ${d.date}`);
      if (typeof d.description !== 'string') throw new Error('Descripción inválida en un día');
      if (!d.explanation || typeof d.explanation !== 'object') {
        const type = classify(d.description);
        d.explanation = { type, purpose: 'Entrenamiento', details: d.description };
      }
    });

    console.log(`[${requestId}] Plan listo. Días: ${parsedPlan.plan.length}, modelo: ${usedModel}, methodology: ${methodology}, zones: ${zones ? 'sí' : 'no'}`);

    const responsePayload = {
      ...parsedPlan,
      meta: {
        attempts,
        fallback:   !rawContent || usedModel?.startsWith('fallback'),
        openAiError,
        model:      usedModel,
        methodology,
        zones,
        phases:     phases.map(p => ({ name: p.name, startWeek: p.startWeek, endWeek: p.endWeek })),
      }
    };

    return new Response(JSON.stringify(responsePayload), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'x-request-id': requestId },
    });

  } catch (error) {
    console.error(`[${requestId}] Error:`, error);
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return new Response(JSON.stringify({ error: message, requestId, timestamp: new Date().toISOString() }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'x-request-id': requestId },
    });
  }
});

/* Local test:
curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/generate-plan' \
  --header 'Authorization: Bearer <anon>' \
  --header 'Content-Type: application/json' \
  --data '{"race":{"name":"10K Ciudad","date":"2025-11-20","distance":10},"goal":"Bajar de 50 minutos","config":{"run_days_per_week":4,"methodology":"polarized","target_time_seconds":2940}}'
*/
