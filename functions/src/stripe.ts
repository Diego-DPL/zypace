import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret }       from 'firebase-functions/params';
import { getFirestore }       from 'firebase-admin/firestore';
/* eslint-disable @typescript-eslint/no-require-imports */
const Stripe = require('stripe');

const REGION   = 'europe-west1';
const APP_URL  = 'https://www.zypace.com';
const PRICE_ID = 'price_1TU6XG2L6uGjMe5kxEPqh3rx';

export const stripeSecretKey = defineSecret('STRIPE_SECRET_KEY');

function stripeClient(): any {
  return new Stripe(stripeSecretKey.value(), { apiVersion: '2026-04-22.dahlia' });
}

async function getOrCreateCustomer(
  stripe: any,
  db:     FirebaseFirestore.Firestore,
  uid:    string,
): Promise<string> {
  const snap = await db.collection('users').doc(uid).get();
  const data = snap.data();
  if (!data) throw new HttpsError('not-found', 'Usuario no encontrado');

  if (data.stripe_customer_id) return data.stripe_customer_id as string;

  const customer = await stripe.customers.create({
    email: data.email as string | undefined,
    name:  data.first_name
      ? `${data.first_name as string} ${(data.last_name as string) ?? ''}`.trim()
      : undefined,
    metadata: { uid },
  });

  await db.collection('users').doc(uid).update({ stripe_customer_id: customer.id });
  return customer.id;
}

// ── createCheckoutSession ──────────────────────────────────────────────
export const createCheckoutSession = onCall(
  { region: REGION, cors: true, invoker: 'public', secrets: [stripeSecretKey] },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'No autenticado');

    const db     = getFirestore();
    const stripe = stripeClient();

    const { promoCode } = request.data as { promoCode?: string };

    const userSnap = await db.collection('users').doc(uid).get();
    const user     = userSnap.data();
    if (!user) throw new HttpsError('not-found', 'Usuario no encontrado');

    if (user.is_exempt) {
      throw new HttpsError('failed-precondition', 'Tu cuenta tiene acceso gratuito');
    }

    if (user.subscription_status === 'active' || user.subscription_status === 'trialing') {
      throw new HttpsError('already-exists', 'Ya tienes una suscripción activa');
    }

    const customerId = await getOrCreateCustomer(stripe, db, uid);

    const params: Record<string, any> = {
      customer:          customerId,
      mode:              'subscription',
      line_items:        [{ price: PRICE_ID, quantity: 1 }],
      success_url:       `${APP_URL}/settings?sub=ok`,
      cancel_url:        `${APP_URL}/settings?sub=canceled`,
      metadata:          { uid },
      subscription_data: { metadata: { uid } },
    };

    // Explicit user code takes priority; fall back to admin-assigned code
    const codeToCheck = promoCode?.toUpperCase().trim() || (user.admin_promo_code as string | undefined);

    if (codeToCheck) {
      const promos = await stripe.promotionCodes.list({ code: codeToCheck, active: true, limit: 1 });
      if (promos.data.length > 0) {
        params.discounts             = [{ promotion_code: promos.data[0].id }];
        params.allow_promotion_codes = false;
      } else if (promoCode) {
        // Only throw if the user explicitly typed a code (not admin-assigned)
        throw new HttpsError('not-found', 'Código de descuento no válido o expirado');
      }
    } else {
      // Show promo-code field in Checkout UI
      params.allow_promotion_codes = true;
    }

    const session = await stripe.checkout.sessions.create(params);
    return { url: session.url };
  },
);

// ── createPortalSession ────────────────────────────────────────────────
export const createPortalSession = onCall(
  { region: REGION, cors: true, invoker: 'public', secrets: [stripeSecretKey] },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'No autenticado');

    const db     = getFirestore();
    const stripe = stripeClient();

    const userSnap   = await db.collection('users').doc(uid).get();
    const customerId = userSnap.data()?.stripe_customer_id as string | undefined;
    if (!customerId) throw new HttpsError('not-found', 'No hay ninguna suscripción asociada a tu cuenta');

    const session = await stripe.billingPortal.sessions.create({
      customer:   customerId,
      return_url: `${APP_URL}/settings`,
    });

    return { url: session.url };
  },
);

// ── validateDiscountCode ───────────────────────────────────────────────
export const validateDiscountCode = onCall(
  { region: REGION, cors: true, invoker: 'public', secrets: [stripeSecretKey] },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'No autenticado');

    const { code } = request.data as { code: string };
    if (!code?.trim()) throw new HttpsError('invalid-argument', 'Falta el código');

    const stripe = stripeClient();
    const promos = await stripe.promotionCodes.list({
      code:   code.toUpperCase().trim(),
      active: true,
      limit:  1,
    });

    if (promos.data.length === 0) return { valid: false };

    const coupon = promos.data[0].coupon;
    return {
      valid:            true,
      discountType:     coupon.percent_off ? 'percentage' : 'fixed',
      discountValue:    coupon.percent_off ?? (coupon.amount_off ? coupon.amount_off / 100 : 0),
      currency:         coupon.currency ?? 'eur',
      duration:         coupon.duration,
      durationInMonths: coupon.duration_in_months ?? null,
    };
  },
);
