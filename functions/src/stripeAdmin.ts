import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
/* eslint-disable @typescript-eslint/no-require-imports */
const Stripe = require('stripe');
import { stripeSecretKey } from './stripe';

const REGION = 'europe-west1';

async function assertAdmin(uid: string | undefined): Promise<void> {
  if (!uid) throw new HttpsError('unauthenticated', 'No autenticado');
  const doc = await getFirestore().collection('users').doc(uid).get();
  if (doc.data()?.role !== 'admin') {
    throw new HttpsError('permission-denied', 'Solo administradores');
  }
}

function stripeClient(): any {
  return new Stripe(stripeSecretKey.value(), { apiVersion: '2026-04-22.dahlia' });
}

// ── createDiscountCode ────────────────────────────────────────────────
export const createDiscountCode = onCall(
  { region: REGION, cors: true, invoker: 'public', secrets: [stripeSecretKey] },
  async (request) => {
    await assertAdmin(request.auth?.uid);

    const {
      code,
      discountType,
      discountValue,
      maxRedemptions,
      duration,
      durationInMonths,
      expiresAt,
    } = request.data as {
      code:              string;
      discountType:      'percentage' | 'fixed';
      discountValue:     number;
      maxRedemptions:    number | null;
      duration:          'forever' | 'once' | 'repeating';
      durationInMonths?: number;
      expiresAt?:        string;
    };

    if (!code?.trim())    throw new HttpsError('invalid-argument', 'Falta el código');
    if (!discountValue || discountValue <= 0) throw new HttpsError('invalid-argument', 'El descuento debe ser mayor que cero');
    if (discountType === 'percentage' && discountValue > 100) throw new HttpsError('invalid-argument', 'El porcentaje no puede superar 100');
    if (duration === 'repeating' && (!durationInMonths || durationInMonths < 1)) {
      throw new HttpsError('invalid-argument', 'Indica el número de meses para la duración "repeating"');
    }

    const db             = getFirestore();
    const stripe         = stripeClient();
    const normalizedCode = code.toUpperCase().trim();

    const existing = await db.collection('discount_codes')
      .where('code', '==', normalizedCode)
      .limit(1)
      .get();
    if (!existing.empty) throw new HttpsError('already-exists', 'Ya existe un código con ese nombre');

    // Create Stripe coupon
    const couponParams: Record<string, any> = {
      name:     normalizedCode,
      duration,
      currency: 'eur',
    };

    if (discountType === 'percentage') {
      couponParams.percent_off = discountValue;
    } else {
      couponParams.amount_off = Math.round(discountValue * 100);
    }

    if (duration === 'repeating') {
      couponParams.duration_in_months = durationInMonths;
    }

    if (maxRedemptions !== null && maxRedemptions > 0) {
      couponParams.max_redemptions = maxRedemptions;
    }

    const coupon = await stripe.coupons.create(couponParams);

    // Create Stripe promotion code
    const promoParams: Record<string, any> = {
      coupon: coupon.id,
      code:   normalizedCode,
    };
    if (maxRedemptions !== null && maxRedemptions > 0) promoParams.max_redemptions = maxRedemptions;
    if (expiresAt) promoParams.expires_at = Math.floor(new Date(expiresAt).getTime() / 1000);

    const promo = await stripe.promotionCodes.create(promoParams);

    const codeRef = await db.collection('discount_codes').add({
      code:                     normalizedCode,
      stripe_coupon_id:         coupon.id,
      stripe_promotion_code_id: promo.id,
      discount_type:            discountType,
      discount_value:           discountValue,
      max_redemptions:          maxRedemptions ?? null,
      duration,
      duration_in_months:       durationInMonths ?? null,
      active:                   true,
      created_at:               Timestamp.now(),
      expires_at:               expiresAt ? Timestamp.fromDate(new Date(expiresAt)) : null,
    });

    console.log(`[createDiscountCode] Created code: ${normalizedCode} (${codeRef.id})`);
    return { id: codeRef.id, code: normalizedCode };
  },
);

// ── listDiscountCodes ─────────────────────────────────────────────────
export const listDiscountCodes = onCall(
  { region: REGION, cors: true, invoker: 'public' },
  async (request) => {
    await assertAdmin(request.auth?.uid);

    const snap = await getFirestore()
      .collection('discount_codes')
      .orderBy('created_at', 'desc')
      .get();

    return snap.docs.map(d => {
      const data = d.data();
      return {
        id:                       d.id,
        code:                     data.code,
        discount_type:            data.discount_type,
        discount_value:           data.discount_value,
        max_redemptions:          data.max_redemptions,
        duration:                 data.duration,
        duration_in_months:       data.duration_in_months,
        active:                   data.active,
        created_at:               (data.created_at as FirebaseFirestore.Timestamp)?.toMillis() ?? null,
        expires_at:               (data.expires_at  as FirebaseFirestore.Timestamp)?.toMillis() ?? null,
        stripe_coupon_id:         data.stripe_coupon_id,
        stripe_promotion_code_id: data.stripe_promotion_code_id,
      };
    });
  },
);

// ── toggleDiscountCode ────────────────────────────────────────────────
export const toggleDiscountCode = onCall(
  { region: REGION, cors: true, invoker: 'public', secrets: [stripeSecretKey] },
  async (request) => {
    await assertAdmin(request.auth?.uid);

    const { codeId, active } = request.data as { codeId: string; active: boolean };
    if (!codeId) throw new HttpsError('invalid-argument', 'Falta codeId');

    const db     = getFirestore();
    const stripe = stripeClient();

    const codeDoc = await db.collection('discount_codes').doc(codeId).get();
    if (!codeDoc.exists) throw new HttpsError('not-found', 'Código no encontrado');

    const promoId = codeDoc.data()?.stripe_promotion_code_id as string | undefined;
    if (promoId) await stripe.promotionCodes.update(promoId, { active });

    await db.collection('discount_codes').doc(codeId).update({ active });
    return { success: true };
  },
);

// ── setUserExempt ─────────────────────────────────────────────────────
export const setUserExempt = onCall(
  { region: REGION, cors: true, invoker: 'public' },
  async (request) => {
    await assertAdmin(request.auth?.uid);

    const { targetUid, exempt } = request.data as { targetUid: string; exempt: boolean };
    if (!targetUid) throw new HttpsError('invalid-argument', 'Falta targetUid');

    const userRef = getFirestore().collection('users').doc(targetUid);
    const snap    = await userRef.get();
    if (!snap.exists) throw new HttpsError('not-found', 'Usuario no encontrado');

    await userRef.update({ is_exempt: exempt });
    console.log(`[setUserExempt] uid=${targetUid} exempt=${exempt}`);
    return { success: true };
  },
);

// ── assignDiscountToUser ──────────────────────────────────────────────
export const assignDiscountToUser = onCall(
  { region: REGION, cors: true, invoker: 'public', secrets: [stripeSecretKey] },
  async (request) => {
    await assertAdmin(request.auth?.uid);

    const { targetUid, promoCode } = request.data as {
      targetUid: string;
      promoCode: string | null;
    };
    if (!targetUid) throw new HttpsError('invalid-argument', 'Falta targetUid');

    const db = getFirestore();

    if (promoCode) {
      const stripe = stripeClient();
      const promos = await stripe.promotionCodes.list({
        code:   promoCode.toUpperCase().trim(),
        active: true,
        limit:  1,
      });
      if (promos.data.length === 0) throw new HttpsError('not-found', 'Código no válido o inactivo');
    }

    await db.collection('users').doc(targetUid).update({
      admin_promo_code: promoCode ? promoCode.toUpperCase().trim() : null,
    });

    console.log(`[assignDiscountToUser] uid=${targetUid} code=${promoCode ?? 'none'}`);
    return { success: true };
  },
);
