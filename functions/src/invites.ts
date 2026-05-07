import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { resendApiKey, sendInviteEmail } from './emailService';

const REGION = 'europe-west1';

async function assertAdmin(uid: string | undefined): Promise<void> {
  if (!uid) throw new HttpsError('unauthenticated', 'No autenticado');
  const doc = await getFirestore().collection('users').doc(uid).get();
  if (doc.data()?.role !== 'admin') {
    throw new HttpsError('permission-denied', 'Solo administradores');
  }
}

// ── createInvite ──────────────────────────────────────────────────────
export const createInvite = onCall(
  { region: REGION, cors: true, invoker: 'public', secrets: [resendApiKey] },
  async (request) => {
    await assertAdmin(request.auth?.uid);

    const { email, notes } = request.data as { email: string; notes?: string };
    if (!email?.trim()) throw new HttpsError('invalid-argument', 'Falta el email');

    const normalizedEmail = email.trim().toLowerCase();
    const db = getFirestore();

    const existing = await db.collection('invites').doc(normalizedEmail).get();
    if (existing.exists) {
      throw new HttpsError('already-exists', 'Ya existe una invitación para este email');
    }

    await db.collection('invites').doc(normalizedEmail).set({
      email:      normalizedEmail,
      is_exempt:  true,
      created_at: Timestamp.now(),
      notes:      notes?.trim() || null,
      used:       false,
    });

    // Send invite email
    try {
      await sendInviteEmail(normalizedEmail);
      console.log(`[createInvite] Invite email sent to: ${normalizedEmail}`);
    } catch (err) {
      console.error('[createInvite] Failed to send invite email:', err);
      // Don't fail the whole function — invite is saved, email is best-effort
    }

    console.log(`[createInvite] Invite created for: ${normalizedEmail}`);
    return { success: true, email: normalizedEmail };
  },
);

// ── revokeInvite ──────────────────────────────────────────────────────
export const revokeInvite = onCall(
  { region: REGION, cors: true, invoker: 'public' },
  async (request) => {
    await assertAdmin(request.auth?.uid);

    const { email } = request.data as { email: string };
    if (!email?.trim()) throw new HttpsError('invalid-argument', 'Falta el email');

    const normalizedEmail = email.trim().toLowerCase();
    await getFirestore().collection('invites').doc(normalizedEmail).delete();

    console.log(`[revokeInvite] Invite revoked for: ${normalizedEmail}`);
    return { success: true };
  },
);

// ── listInvites ───────────────────────────────────────────────────────
export const listInvites = onCall(
  { region: REGION, cors: true, invoker: 'public' },
  async (request) => {
    await assertAdmin(request.auth?.uid);

    const snap = await getFirestore()
      .collection('invites')
      .orderBy('created_at', 'desc')
      .get();

    return snap.docs.map(d => {
      const data = d.data();
      return {
        email:      d.id,
        is_exempt:  data.is_exempt  as boolean,
        used:       data.used       as boolean,
        notes:      data.notes      as string | null,
        created_at: (data.created_at as FirebaseFirestore.Timestamp)?.toMillis() ?? null,
        used_at:    (data.used_at   as FirebaseFirestore.Timestamp)?.toMillis() ?? null,
      };
    });
  },
);
