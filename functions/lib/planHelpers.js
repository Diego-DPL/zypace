"use strict";
// planHelpers.ts — Shared logic for generatePlan and generateNextMesocycle
Object.defineProperty(exports, "__esModule", { value: true });
exports.secToMinStr = secToMinStr;
exports.estimateZones = estimateZones;
exports.computePhases = computePhases;
exports.phaseForWeek = phaseForWeek;
exports.strengthSession = strengthSession;
exports.buildFallbackMesocycle = buildFallbackMesocycle;
function secToMinStr(s) {
    const mm = Math.floor(s / 60);
    const ss = Math.round(s % 60).toString().padStart(2, '0');
    return `${mm}:${ss}/km`;
}
function estimateZones(targetTimeSec, distKm) {
    if (!targetTimeSec || !distKm || distKm <= 0 || targetTimeSec <= 0)
        return null;
    const t10k = targetTimeSec * Math.pow(10 / distKm, 1.06);
    const p10k = t10k / 10;
    return {
        z1: secToMinStr(p10k * 1.28),
        z4: secToMinStr(p10k * 1.02),
        z5: secToMinStr(p10k * 0.90),
        race: secToMinStr(targetTimeSec / distKm),
    };
}
function computePhases(totalWeeks) {
    if (totalWeeks >= 16) {
        return [
            { name: 'base', startWeek: 1, endWeek: 6, rule: 'Solo Z1. Sin sesiones de calidad. Construir hábito aeróbico. Descarga semana 4.' },
            { name: 'desarrollo', startWeek: 7, endWeek: totalWeeks - 4, rule: '1-2 sesiones calidad/sem (Z4-Z5). Descarga cada 4ª semana (−25% volumen).' },
            { name: 'especifico', startWeek: totalWeeks - 3, endWeek: totalWeeks - 2, rule: 'Trabajo a ritmo de carrera. Volumen pico. 2 sesiones calidad/sem.' },
            { name: 'taper', startWeek: totalWeeks - 1, endWeek: totalWeeks, rule: 'Volumen −45%. Mantener 1 sesión corta de intensidad. Frescura máxima.' },
        ];
    }
    if (totalWeeks >= 10) {
        const taper = 2, spec = 2;
        const rest = totalWeeks - taper - spec;
        const base = Math.max(2, Math.floor(rest * 0.45));
        return [
            { name: 'base', startWeek: 1, endWeek: base, rule: 'Solo Z1. Sin calidad. Base aeróbica. Descarga semana 4 si aplica.' },
            { name: 'desarrollo', startWeek: base + 1, endWeek: totalWeeks - taper - spec, rule: '1-2 sesiones calidad/sem. Descarga cada 4ª semana (−25%).' },
            { name: 'especifico', startWeek: totalWeeks - taper - spec + 1, endWeek: totalWeeks - taper, rule: 'Sesiones a ritmo de carrera. Calidad prioritaria.' },
            { name: 'taper', startWeek: totalWeeks - taper + 1, endWeek: totalWeeks, rule: 'Volumen −40-50%. Activación pre-carrera.' },
        ];
    }
    if (totalWeeks >= 6) {
        return [
            { name: 'base', startWeek: 1, endWeek: 2, rule: 'Rodajes fáciles Z1. Sin calidad. Adaptación.' },
            { name: 'desarrollo', startWeek: 3, endWeek: totalWeeks - 2, rule: '1 sesión calidad/sem.' },
            { name: 'taper', startWeek: totalWeeks - 1, endWeek: totalWeeks, rule: 'Reducir volumen 35-40%.' },
        ];
    }
    if (totalWeeks >= 3) {
        return [
            { name: 'desarrollo', startWeek: 1, endWeek: totalWeeks - 1, rule: '1 sesión calidad/sem, resto Z1.' },
            { name: 'taper', startWeek: totalWeeks, endWeek: totalWeeks, rule: 'Activación: rodaje suave + strides breves.' },
        ];
    }
    return [
        { name: 'taper', startWeek: 1, endWeek: totalWeeks, rule: 'Plan de activación pre-carrera.' },
    ];
}
function phaseForWeek(phases, w) {
    var _a;
    return (_a = phases.find(p => w >= p.startWeek && w <= p.endWeek)) !== null && _a !== void 0 ? _a : phases[phases.length - 1];
}
function strengthSession(phaseName, sessionNum, isRecovery, isTaper, distKm) {
    const isTrail = distKm === 0 || distKm > 21;
    if (isTaper)
        return {
            desc: 'Fuerza mantenimiento pre-carrera',
            purpose: 'Mantener adaptaciones neuromusculares sin acumular fatiga. Volumen -40%, mismas cargas.',
            details: `Sesión ~35min. Reducir series al 60%, no bajar las cargas.
BLOQUE A: Peso muerto rumano 3×4 (carga habitual, excéntrico 2s) · Sentadilla búlgara 2×4/pierna
BLOQUE B: Hip thrust 3×5 explosivo · Calf raise excéntrico 2×8/pierna
BLOQUE C (8min core): Plancha frontal 2×30s · Pallof press 2×8/lado
Sin pliometría. Finaliza con 5min movilidad de cadera y tobillo.`,
        };
    if (isRecovery)
        return {
            desc: 'Fuerza descarga semanal',
            purpose: 'Semana de descarga: -30% volumen, -20% carga. Mantener patrones neuromusculares.',
            details: `Sesión ~40min.
BLOQUE A: Peso muerto rumano 3×5 (carga -20%, técnica perfecta) · Zancada búlgara 2×6/pierna
BLOQUE B: Curl nórdico 2×4 (asistido si es necesario) · Hip thrust 3×8 (carga ligera)
BLOQUE C (10min): Plancha frontal 2×30s · Plancha lateral 2×20s/lado · Bird-dog 2×8/lado
Sin ejercicios explosivos esta semana.`,
        };
    if (phaseName === 'base') {
        if (sessionNum === 1)
            return {
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
        if (sessionNum === 2)
            return {
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
        if (sessionNum === 1)
            return {
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
        if (sessionNum === 2)
            return {
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
        if (sessionNum === 1)
            return {
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
        if (sessionNum === 2)
            return {
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
function buildFallbackMesocycle(p) {
    var _a, _b, _c, _d, _e, _f, _g;
    const { startISO, endISO, totalWeeks, mesocycleStartWeek, phases, taperWeeks, runDays, runDaysOfWeek, includeStrength, strengthDaysOfWeek, strengthDaysCount, distKm, methodology, zones, } = p;
    const days = [];
    const start = new Date(startISO + 'T00:00:00Z');
    const end = new Date(endISO + 'T00:00:00Z');
    const startDow = start.getUTCDay(); // 0=Sun
    const wdFor = (dow) => (dow - startDow + 7) % 7;
    const sundayWd = wdFor(0);
    const tuesdayWd = wdFor(2);
    const thursdayWd = wdFor(4);
    const saturdayWd = wdFor(6);
    // Number of weeks to generate (from start to end inclusive)
    const mesoDurationMs = end.getTime() - start.getTime() + 86400000;
    const mesoWeeks = Math.ceil(mesoDurationMs / (7 * 86400000));
    for (let w = 0; w < mesoWeeks; w++) {
        const weekNum = mesocycleStartWeek + w;
        const phase = phaseForWeek(phases, weekNum);
        const isRecoveryWeek = weekNum > 1 && weekNum % 4 === 0;
        const isTaper = phase.name === 'taper';
        const isBase = phase.name === 'base';
        const volScale = isRecoveryWeek ? 0.72 : isTaper ? 0.55 : 1.0;
        const peakWeek = Math.max(1, totalWeeks - taperWeeks - 1);
        const prog = Math.min((weekNum - 1) / peakWeek, 1.0);
        const maxLongKm = distKm >= 42 ? 32 : distKm >= 21 ? 20 : distKm >= 10 ? 15 : 12;
        const longRunKm = Math.round((9 + prog * (maxLongKm - 9)) * volScale);
        const easyKm = Math.round((5 + prog * 4) * volScale);
        const hasQuality = !isBase;
        const qualReps1 = Math.round((4 + prog * 4) * volScale);
        const qualReps2 = Math.round((4 + prog * 4) * volScale);
        const dayPlans = {};
        // ── Run day set ──────────────────────────────────────────
        // Standard quality days (tue/thu) are computed first for reference
        const stdQualDays = [];
        if (hasQuality) {
            stdQualDays.push(tuesdayWd);
            if (methodology === 'norwegian' || (runDays >= 4 && phase.name !== 'base')) {
                stdQualDays.push(thursdayWd);
            }
        }
        let runDaySet;
        if (runDaysOfWeek && runDaysOfWeek.length > 0) {
            runDaySet = new Set(runDaysOfWeek.map(dow => wdFor(dow)));
        }
        else {
            runDaySet = new Set([...stdQualDays, sundayWd]);
            const fillOrder = [wdFor(1), wdFor(3), wdFor(5), wdFor(6), wdFor(0), wdFor(2), wdFor(4)];
            for (const wd of fillOrder) {
                if (runDaySet.size >= runDays)
                    break;
                if (!runDaySet.has(wd))
                    runDaySet.add(wd);
            }
        }
        // Determine effective long-run day (Sunday if available, else last in week)
        const sortedRunDays = Array.from(runDaySet).sort((a, b) => a - b);
        const longRunDay = runDaySet.has(sundayWd)
            ? sundayWd
            : sortedRunDays[sortedRunDays.length - 1];
        // Effective quality days: prefer standard days if they're in the set,
        // otherwise pick middle / non-adjacent days from the set
        let effQ1;
        let effQ2;
        if (hasQuality) {
            const nonLong = sortedRunDays.filter(d => d !== longRunDay);
            effQ1 = nonLong.includes(tuesdayWd)
                ? tuesdayWd
                : nonLong.length > 0 ? nonLong[Math.floor(nonLong.length / 2)] : undefined;
            if (stdQualDays.length >= 2) {
                const preferThursday = nonLong.includes(thursdayWd) && thursdayWd !== effQ1;
                effQ2 = preferThursday
                    ? thursdayWd
                    : (_a = nonLong.find(d => d !== effQ1 && (effQ1 === undefined || Math.abs(d - effQ1) >= 2))) !== null && _a !== void 0 ? _a : nonLong.find(d => d !== effQ1);
            }
        }
        for (const wd of Array.from(runDaySet)) {
            if (wd === longRunDay) {
                dayPlans[wd] = {
                    desc: `Largo ${longRunKm}km`,
                    type: 'largo',
                    purpose: 'Resistencia aeróbica, eficiencia metabólica y adaptación muscular',
                    details: `${longRunKm}km completamente en Z1 (${(zones === null || zones === void 0 ? void 0 : zones.z1) || 'ritmo conversacional'}). Hidrata cada 20-25min.`,
                    intensity: (_b = zones === null || zones === void 0 ? void 0 : zones.z1) !== null && _b !== void 0 ? _b : 'Z1 — conversacional',
                };
            }
            else if (effQ1 !== undefined && wd === effQ1 && hasQuality) {
                if (methodology === 'norwegian') {
                    dayPlans[wd] = {
                        desc: `Umbral ${qualReps1}×1000m`,
                        type: 'umbral',
                        purpose: 'Desarrollo del umbral anaeróbico (LT2, ~4mmol lactato)',
                        details: `Calentamiento 15min Z1. ${qualReps1}×1000m a ${(zones === null || zones === void 0 ? void 0 : zones.z4) || 'ritmo 10k'}. Recuperación 90-120s al trote suave. Enfriamiento 10min Z1.`,
                        intensity: (_c = zones === null || zones === void 0 ? void 0 : zones.z4) !== null && _c !== void 0 ? _c : 'Z4 — umbral LT2',
                    };
                }
                else {
                    dayPlans[wd] = {
                        desc: `Series ${qualReps1}×4min`,
                        type: 'series',
                        purpose: 'Desarrollo del VO2max y economía de carrera',
                        details: `Calentamiento 15min Z1. ${qualReps1}×4min a ${(zones === null || zones === void 0 ? void 0 : zones.z5) || 'ritmo 5k'} con recuperación activa de 4min al trote. Enfriamiento 10min Z1.`,
                        intensity: (_d = zones === null || zones === void 0 ? void 0 : zones.z5) !== null && _d !== void 0 ? _d : 'Z5 — VO2max',
                    };
                }
            }
            else if (effQ2 !== undefined && wd === effQ2 && hasQuality) {
                if (methodology === 'norwegian') {
                    dayPlans[wd] = {
                        desc: `Umbral ${qualReps2}×1000m`,
                        type: 'umbral',
                        purpose: '2ª sesión de umbral semanal — método noruego doble umbral',
                        details: `Calentamiento 15min Z1. ${qualReps2}×1000m a ${(zones === null || zones === void 0 ? void 0 : zones.z4) || 'ritmo 10k'}. Recuperación 90s trote. Enfriamiento 10min Z1.`,
                        intensity: (_e = zones === null || zones === void 0 ? void 0 : zones.z4) !== null && _e !== void 0 ? _e : 'Z4 — umbral LT2',
                    };
                }
                else {
                    const tempoKm = Math.round((4 + prog * 6) * volScale);
                    dayPlans[wd] = {
                        desc: `Tempo ${tempoKm}km`,
                        type: 'tempo',
                        purpose: 'Umbral aeróbico, eficiencia a ritmo de competición',
                        details: `Calentamiento 10min Z1. ${tempoKm}km continuos a ${(zones === null || zones === void 0 ? void 0 : zones.z4) || 'ritmo 10k-HM'}. Enfriamiento 10min Z1.`,
                        intensity: (_f = zones === null || zones === void 0 ? void 0 : zones.z4) !== null && _f !== void 0 ? _f : 'Z4 — tempo',
                    };
                }
            }
            else {
                const km = Math.max(4, Math.round(easyKm * (wd === saturdayWd ? 0.85 : 1.0)));
                dayPlans[wd] = {
                    desc: `Rodaje suave ${km}km`,
                    type: 'suave',
                    purpose: 'Base aeróbica, recuperación activa y adaptación músculo-esquelética',
                    details: `${km}km en Z1 a ${(zones === null || zones === void 0 ? void 0 : zones.z1) || 'ritmo conversacional'}. Mantén una conversación fluida.`,
                    intensity: (_g = zones === null || zones === void 0 ? void 0 : zones.z1) !== null && _g !== void 0 ? _g : 'Z1 — fácil',
                };
            }
        }
        // ── Strength placement ──────────────────────────────────
        if (includeStrength) {
            if (strengthDaysOfWeek && strengthDaysOfWeek.length > 0) {
                let sessionNum = 0;
                for (const dow of strengthDaysOfWeek) {
                    const wd = wdFor(dow);
                    if (!dayPlans[wd]) {
                        sessionNum++;
                        const sData = strengthSession(phase.name, sessionNum, isRecoveryWeek, isTaper, distKm);
                        dayPlans[wd] = { desc: sData.desc, type: 'fuerza', purpose: sData.purpose, details: sData.details, intensity: null };
                    }
                }
            }
            else if (strengthDaysCount > 0) {
                let added = 0;
                for (let wd = 0; wd < 7 && added < strengthDaysCount; wd++) {
                    if (!dayPlans[wd]) {
                        const sData = strengthSession(phase.name, added + 1, isRecoveryWeek, isTaper, distKm);
                        dayPlans[wd] = { desc: sData.desc, type: 'fuerza', purpose: sData.purpose, details: sData.details, intensity: null };
                        added++;
                    }
                }
            }
        }
        // Fill rest days
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
        // Emit days
        for (let wd = 0; wd < 7; wd++) {
            const date = new Date(start.getTime() + (w * 7 + wd) * 86400000);
            if (date > end)
                break;
            const dp = dayPlans[wd];
            days.push({
                date: date.toISOString().split('T')[0],
                description: dp.desc,
                explanation: {
                    type: dp.type,
                    purpose: dp.purpose,
                    details: dp.details,
                    intensity: dp.intensity,
                    phase: phase.name,
                },
            });
        }
    }
    return { plan: days };
}
//# sourceMappingURL=planHelpers.js.map