// migrateStrengthExercises — Takes all strength workouts from a plan and asks
// the AI (one single call) to parse the exercises from the description field,
// returning a structured exercises array that gets saved back to Firestore.

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret }       from 'firebase-functions/params';
import { getFirestore }       from 'firebase-admin/firestore';

const openAiApiKey = defineSecret('OPENAI_API_KEY');
const REGION = 'europe-west1';

export const migrateStrengthExercises = onCall(
  { region: REGION, cors: true, invoker: 'public', secrets: [openAiApiKey], timeoutSeconds: 180 },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'No autenticado');

    const { plan_id } = request.data as { plan_id: string };
    if (!plan_id) throw new HttpsError('invalid-argument', 'Falta plan_id');

    const db = getFirestore();

    // Fetch strength workouts for this plan that lack structured exercises
    const snap = await db
      .collection('users').doc(uid)
      .collection('workouts')
      .where('plan_id', '==', plan_id)
      .get();

    // Include ALL strength workouts — overwrite even existing exercises in case
    // they were incorrectly populated by a previous text-only parser run.
    const targets = snap.docs.filter(d => {
      const data = d.data();
      return data.explanation_json?.type === 'fuerza' || /fuerza/i.test(data.description || '');
    });

    if (targets.length === 0) {
      return { converted: 0, message: 'No hay entrenamientos de fuerza en este plan.' };
    }

    // Call AI in parallel — one request per workout to keep each call short
    async function extractExercises(id: string, description: string): Promise<{ id: string; exercises: any[] } | null> {
      const prompt = `Extrae los ejercicios de esta descripción de entrenamiento de fuerza.
Devuelve SOLO JSON: {"exercises":[{"sets":3,"reps":"10","name":"Nombre","notes":"obs. breve o null"}]}
Reglas: sets=entero, reps puede ser "10", "10-12", "25 m/lado", "30s", etc.
Ignora el texto introductorio antes de los dos puntos y notas finales tras ";".
Descripción: ${description}`;

      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openAiApiKey.value()}` },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          temperature: 0,
          messages: [{ role: 'user', content: prompt }],
          response_format: { type: 'json_object' },
        }),
      });
      if (!res.ok) return null;
      const json = await res.json() as any;
      try {
        const parsed = JSON.parse(json.choices?.[0]?.message?.content || '{}');
        if (Array.isArray(parsed.exercises) && parsed.exercises.length > 0) {
          return { id, exercises: parsed.exercises };
        }
      } catch { /* skip */ }
      return null;
    }

    const results = await Promise.all(
      targets.map(d => extractExercises(d.id, d.data().description as string))
    );

    // Save back to Firestore in a batch
    const batch = db.batch();
    let updated = 0;

    for (const result of results) {
      if (!result) continue;
      const snap = targets.find(d => d.id === result.id);
      if (!snap) continue;
      const existing = snap.data().explanation_json || {};
      batch.update(
        db.collection('users').doc(uid).collection('workouts').doc(result.id),
        { explanation_json: { ...existing, exercises: result.exercises } },
      );
      updated++;
    }

    await batch.commit();
    return { converted: updated, message: `${updated} entrenamiento${updated !== 1 ? 's' : ''} de fuerza estructurado${updated !== 1 ? 's' : ''}.` };
  },
);
