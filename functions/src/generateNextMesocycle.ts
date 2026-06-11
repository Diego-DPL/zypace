// generateNextMesocycle — HTTP callable wrapper around generateMesocycleCore.
// Handles auth, rate limiting, and subscription checks.
// The core generation logic lives in mesocycleCore.ts.

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { getFirestore } from 'firebase-admin/firestore';
import { generateMesocycleCore } from './mesocycleCore';

const openAiApiKey = defineSecret('OPENAI_API_KEY');
const openAiModel  = defineSecret('OPENAI_MODEL');

export const generateNextMesocycle = onCall(
  { region: 'europe-west1', cors: true, invoker: 'public', secrets: [openAiApiKey, openAiModel], timeoutSeconds: 300, memory: '512MiB' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'No autenticado');

    const { plan_id: planId } = (request.data ?? {}) as { plan_id?: string };
    if (!planId) throw new HttpsError('invalid-argument', 'Falta plan_id');

    const db = getFirestore();

    // Rate limiting: max 10 mesocycle generations per user per 24h
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentGens = await db.collection('users').doc(uid).collection('generation_log')
      .where('kind', '==', 'mesocycle').where('created_at', '>=', since).count().get();
    if (recentGens.data().count >= 10) {
      throw new HttpsError('resource-exhausted', 'Límite de generaciones alcanzado. Inténtalo de nuevo en 24 horas.');
    }

    const apiKey = openAiApiKey.value();
    if (!apiKey) throw new HttpsError('internal', 'OPENAI_API_KEY no configurada');
    const model  = (openAiModel.value() || 'gpt-4o-mini').trim();

    try {
      return await generateMesocycleCore(db, uid, planId, apiKey, model);
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes('No encontrado') || msg.includes('not found'))  throw new HttpsError('not-found', msg);
      if (msg.includes('ya pasó'))                                      throw new HttpsError('failed-precondition', msg);
      if (msg.includes('ya cubre'))                                     throw new HttpsError('failed-precondition', msg);
      if (msg.includes('suscripción'))                                  throw new HttpsError('permission-denied', msg);
      throw new HttpsError('internal', msg);
    }
  }
);
