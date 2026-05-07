// migrateStrengthExercises — Takes all strength workouts from a plan and asks
// the AI (one single call) to parse the exercises from the description field,
// returning a structured exercises array that gets saved back to Firestore.

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret }       from 'firebase-functions/params';
import { getFirestore }       from 'firebase-admin/firestore';

const openAiApiKey = defineSecret('OPENAI_API_KEY');
const REGION = 'europe-west1';

export const migrateStrengthExercises = onCall(
  { region: REGION, cors: true, invoker: 'public', secrets: [openAiApiKey], timeoutSeconds: 120 },
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

    const targets = snap.docs.filter(d => {
      const data = d.data();
      const isStrength = data.explanation_json?.type === 'fuerza' || /fuerza/i.test(data.description || '');
      const alreadyDone = Array.isArray(data.explanation_json?.exercises) && data.explanation_json.exercises.length > 0;
      return isStrength && !alreadyDone;
    });

    if (targets.length === 0) {
      return { converted: 0, message: 'Ningún entrenamiento de fuerza pendiente de convertir.' };
    }

    // Build prompt with all descriptions in one call
    const workoutList = targets.map(d => ({
      id: d.id,
      description: d.data().description as string,
    }));

    const prompt = `Eres un asistente que extrae ejercicios de descripciones de entrenamientos de fuerza.

Devuelve SOLO JSON válido con este formato exacto:
{"workouts":[{"id":"<id>","exercises":[{"sets":3,"reps":"10","name":"Nombre ejercicio","notes":"observación opcional o null"}]}]}

Reglas:
- "sets" es un número entero
- "reps" puede ser "10", "10-12", "25 m/lado", "30s", "1 min", etc.
- "name" es el nombre del ejercicio sin sets ni reps
- "notes" solo si hay algo relevante (pausa, ritmo excéntrico, etc.), si no pon null
- Si la descripción tiene formato "ejercicio NxM/lado", incluye "/lado" en reps
- Ignora el texto introductorio ("Sesión de fuerza X:", "terminar con...", etc.)

Entrenamientos a procesar:
${JSON.stringify(workoutList, null, 2)}`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openAiApiKey.value()}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      throw new HttpsError('internal', `OpenAI error: ${response.status}`);
    }

    const json = await response.json() as any;
    const raw  = json.choices?.[0]?.message?.content || '{}';
    let parsed: { workouts: { id: string; exercises: any[] }[] };

    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new HttpsError('internal', 'La IA devolvió JSON inválido');
    }

    // Save exercises back to Firestore
    const batch = db.batch();
    let updated = 0;

    for (const w of (parsed.workouts || [])) {
      if (!w.id || !Array.isArray(w.exercises) || w.exercises.length === 0) continue;
      const docRef = db.collection('users').doc(uid).collection('workouts').doc(w.id);
      const snap   = targets.find(d => d.id === w.id);
      if (!snap) continue;
      const existing = snap.data().explanation_json || {};
      batch.update(docRef, {
        explanation_json: { ...existing, exercises: w.exercises },
      });
      updated++;
    }

    await batch.commit();
    return { converted: updated, message: `${updated} entrenamiento${updated !== 1 ? 's' : ''} de fuerza estructurado${updated !== 1 ? 's' : ''}.` };
  },
);
