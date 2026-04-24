// calibrateZones — Estima zonas de entrenamiento personalizadas.
//
// Algoritmo:
//   1. Filtra carreras válidas de los últimos 90 días
//   2. Agrupa por tramo de distancia: corto (4-7km), medio (8-14km), largo (>14km)
//   3. Estima ritmo de 5k y 10k con fórmula de Riegel desde los mejores esfuerzos
//   4. Valida Z1 contra ritmo de rodajes largos (cuando hay datos suficientes)
//   5. Guarda zonas en el documento del usuario y las devuelve
//
// Referencias: Seiler & Tønnessen (2009), Jack Daniels Running Formula

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

// ── Helpers ──────────────────────────────────────────────────

function secToMinStr(s: number): string {
  const mm = Math.floor(s / 60);
  const ss = Math.round(s % 60).toString().padStart(2, '0');
  return `${mm}:${ss}/km`;
}

/** Riegel projection: scale pace from known distance to target distance.
 *  pace_target = pace_known * (dist_target / dist_known)^0.06
 */
function riegel(paceSec: number, fromKm: number, toKm: number): number {
  return paceSec * Math.pow(toKm / fromKm, 0.06);
}

function median(arr: number[]): number {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// ── Function ─────────────────────────────────────────────────

export const calibrateZones = onCall(
  { region: 'europe-west1', cors: true, invoker: 'public' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'No autenticado');

    const db = getFirestore();

    // ── 1. Fetch running activities (last 90 days) ───────────
    const since90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10);

    const actSnap = await db
      .collection('users').doc(uid)
      .collection('strava_activities')
      .where('start_date', '>=', since90)
      .orderBy('start_date', 'desc')
      .get();

    if (actSnap.empty) {
      return {
        success: false,
        reason: 'no_activities',
        message: 'No hay actividades de Strava en los últimos 90 días. Sincroniza tu cuenta desde Ajustes.',
      };
    }

    // ── 2. Filter valid running activities ───────────────────
    const MIN_PACE = 140, MAX_PACE = 570; // 2:20/km to 9:30/km
    const MIN_DIST = 1000; // 1km minimum

    interface RunActivity {
      distKm: number;
      paceSec: number;
      likelyContinuous: boolean;
    }

    const runs: RunActivity[] = [];

    for (const doc of actSnap.docs) {
      const a = doc.data();
      const st = ((a.sport_type as string) || '').toLowerCase();
      if (st && !['run', 'trail', 'walk', ''].some(r => st.includes(r))) {
        if (['ride', 'virtualride', 'swim', 'rowing', 'kayaking', 'ski'].some(s => st.includes(s))) continue;
      }

      const dm = Number(a.distance_m) || 0;
      const mt = Number(a.moving_time) || 0;
      if (dm < MIN_DIST || mt < 60) continue;

      const distKm = dm / 1000;
      const paceSec = mt / distKm;
      if (paceSec < MIN_PACE || paceSec > MAX_PACE) continue;

      const likelyContinuous = distKm >= 3.0;
      runs.push({ distKm, paceSec, likelyContinuous });
    }

    if (runs.length < 3) {
      return {
        success: false,
        reason: 'insufficient_data',
        message: `Solo ${runs.length} actividades de running válidas en los últimos 90 días. Necesitas al menos 3 para calibrar zonas con confianza.`,
      };
    }

    // ── 3. Group by distance bracket ────────────────────────
    const short  = runs.filter(r => r.distKm >= 4  && r.distKm <= 7);
    const medium = runs.filter(r => r.distKm >= 8  && r.distKm <= 14);
    const long_  = runs.filter(r => r.distKm > 14);

    const byPace = (a: RunActivity, b: RunActivity) => a.paceSec - b.paceSec;
    short.sort(byPace);
    medium.sort(byPace);
    long_.sort(byPace);

    // ── 4. Estimate 5k pace ──────────────────────────────────
    let p5kSec: number | null = null;
    if (short.length >= 1) {
      const top3 = short.slice(0, Math.min(3, short.length));
      p5kSec = median(top3.map(r => riegel(r.paceSec, r.distKm, 5)));
    }

    // ── 5. Estimate 10k pace ─────────────────────────────────
    let p10kSec: number | null = null;
    if (medium.length >= 1) {
      const top3 = medium.slice(0, Math.min(3, medium.length));
      p10kSec = median(top3.map(r => riegel(r.paceSec, r.distKm, 10)));
    }

    // ── 6. Cross-project missing brackets ───────────────────
    if (!p10kSec && p5kSec)  p10kSec = riegel(p5kSec, 5, 10);
    if (!p5kSec  && p10kSec) p5kSec  = riegel(p10kSec, 10, 5);

    if (!p10kSec && runs.length >= 3) {
      const allPaces = runs.map(r => r.paceSec).sort((a, b) => a - b);
      const bestPace = allPaces[0];
      const bestDist = runs.find(r => r.paceSec === bestPace)!.distKm;
      p10kSec = riegel(bestPace, bestDist, 10);
      p5kSec  = riegel(bestPace, bestDist, 5);
    }

    if (!p10kSec || !p5kSec) {
      return {
        success: false,
        reason: 'projection_failed',
        message: 'No se pudo estimar el ritmo de referencia. Intenta con más actividades.',
      };
    }

    // ── 7. Estimate Z1 from long runs ────────────────────────
    let z1Sec: number;
    if (long_.length >= 2) {
      const z1FromLong = median(long_.map(r => r.paceSec));
      const ratio = z1FromLong / p10kSec;
      z1Sec = (ratio >= 1.15 && ratio <= 1.50) ? z1FromLong : p10kSec * 1.28;
    } else {
      z1Sec = p10kSec * 1.28;
    }

    // ── 8. Final zone values ─────────────────────────────────
    const z1Final = Math.round(z1Sec);
    const z4Final = Math.round(p10kSec * 1.02);
    const z5Final = Math.round(p5kSec  * 0.95);

    const estimated5kSec  = Math.round(p5kSec  * 5);
    const estimated10kSec = Math.round(p10kSec * 10);

    // ── 9. Confidence level ──────────────────────────────────
    const bracketsWithData = [short, medium, long_].filter(b => b.length >= 2).length;
    let confidence: 'alta' | 'media' | 'baja';
    if (runs.length >= 15 && bracketsWithData >= 2)     confidence = 'alta';
    else if (runs.length >= 5 || bracketsWithData >= 1) confidence = 'media';
    else                                                 confidence = 'baja';

    // ── 10. Store in user document ───────────────────────────
    await db.collection('users').doc(uid).set({
      z1_pace_sec_km:    z1Final,
      z4_pace_sec_km:    z4Final,
      z5_pace_sec_km:    z5Final,
      estimated_5k_sec:  estimated5kSec,
      estimated_10k_sec: estimated10kSec,
      zones_confidence:  confidence,
      zones_activities:  runs.length,
      zones_calibrated_at: new Date().toISOString(),
      updated_at: FieldValue.serverTimestamp(),
    }, { merge: true });

    function formatTime(totalSec: number): string {
      const m = Math.floor(totalSec / 60);
      const s = Math.round(totalSec % 60).toString().padStart(2, '0');
      return `${m}:${s}`;
    }

    return {
      success: true,
      zones: {
        z1: { sec_km: z1Final, display: secToMinStr(z1Final), label: 'Fácil / Aeróbico Z1' },
        z4: { sec_km: z4Final, display: secToMinStr(z4Final), label: 'Umbral / LT2 Z4' },
        z5: { sec_km: z5Final, display: secToMinStr(z5Final), label: 'VO2max Z5' },
      },
      estimates: {
        time_5k:  { sec: estimated5kSec,  display: formatTime(estimated5kSec)  },
        time_10k: { sec: estimated10kSec, display: formatTime(estimated10kSec) },
      },
      confidence,
      activities_analyzed: runs.length,
      brackets: {
        short_runs:  short.length,
        medium_runs: medium.length,
        long_runs:   long_.length,
      },
      calibrated_at: new Date().toISOString(),
      note: confidence === 'baja'
        ? 'Pocos datos — sigue entrenando y recalibra en unas semanas para mayor precisión.'
        : confidence === 'media'
        ? 'Calibración moderada — mejorará con más actividades de distintos tipos y distancias.'
        : 'Calibración robusta — basada en suficientes actividades y distancias variadas.',
    };
  }
);
