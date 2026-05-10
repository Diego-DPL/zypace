"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateDiscountCode = exports.cancelSubscription = exports.createPortalSession = exports.createCheckoutSession = exports.stripeSecretKey = void 0;
const https_1 = require("firebase-functions/v2/https");
const params_1 = require("firebase-functions/params");
const firestore_1 = require("firebase-admin/firestore");
/* eslint-disable @typescript-eslint/no-require-imports */
const Stripe = require('stripe');
const emailService_1 = require("./emailService");
const REASON_LABELS = {
    not_using: 'No le estaba sacando el partido esperado',
    price: 'Precio no encaja con el presupuesto',
    other_app: 'Prefiere otra aplicación',
    break: 'Descanso del running',
    missing_feature: 'Falta una función necesaria',
    other: 'Otro motivo',
};
const REGION = 'europe-west1';
const APP_URL = 'https://www.zypace.com';
const PRICE_ID = 'price_1TUTC9RqrUcauGyU6vdSu5z4';
exports.stripeSecretKey = (0, params_1.defineSecret)('STRIPE_SECRET_KEY');
function stripeClient() {
    return new Stripe(exports.stripeSecretKey.value(), { apiVersion: '2026-04-22.dahlia' });
}
async function getOrCreateCustomer(stripe, db, uid) {
    var _a;
    const snap = await db.collection('users').doc(uid).get();
    const data = snap.data();
    if (!data)
        throw new https_1.HttpsError('not-found', 'Usuario no encontrado');
    if (data.stripe_customer_id)
        return data.stripe_customer_id;
    const customer = await stripe.customers.create({
        email: data.email,
        name: data.first_name
            ? `${data.first_name} ${(_a = data.last_name) !== null && _a !== void 0 ? _a : ''}`.trim()
            : undefined,
        metadata: { uid },
    });
    await db.collection('users').doc(uid).update({ stripe_customer_id: customer.id });
    return customer.id;
}
// ── createCheckoutSession ──────────────────────────────────────────────
exports.createCheckoutSession = (0, https_1.onCall)({ region: REGION, cors: true, invoker: 'public', secrets: [exports.stripeSecretKey] }, async (request) => {
    var _a;
    const uid = (_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid;
    if (!uid)
        throw new https_1.HttpsError('unauthenticated', 'No autenticado');
    const db = (0, firestore_1.getFirestore)();
    const stripe = stripeClient();
    const { promoCode } = request.data;
    const userSnap = await db.collection('users').doc(uid).get();
    const user = userSnap.data();
    if (!user)
        throw new https_1.HttpsError('not-found', 'Usuario no encontrado');
    if (user.is_exempt) {
        throw new https_1.HttpsError('failed-precondition', 'Tu cuenta tiene acceso gratuito');
    }
    if (user.subscription_status === 'active' || user.subscription_status === 'trialing') {
        throw new https_1.HttpsError('already-exists', 'Ya tienes una suscripción activa');
    }
    const customerId = await getOrCreateCustomer(stripe, db, uid);
    const params = {
        customer: customerId,
        mode: 'subscription',
        line_items: [{ price: PRICE_ID, quantity: 1 }],
        success_url: `${APP_URL}/app?sub=ok`,
        cancel_url: `${APP_URL}/subscribe?canceled=true`,
        metadata: { uid },
        subscription_data: { metadata: { uid }, trial_period_days: 30 },
    };
    // Explicit user code takes priority; fall back to admin-assigned code
    const codeToCheck = (promoCode === null || promoCode === void 0 ? void 0 : promoCode.toUpperCase().trim()) || user.admin_promo_code;
    if (codeToCheck) {
        const promos = await stripe.promotionCodes.list({ code: codeToCheck, active: true, limit: 1 });
        if (promos.data.length > 0) {
            params.discounts = [{ promotion_code: promos.data[0].id }];
            params.allow_promotion_codes = false;
        }
        else if (promoCode) {
            // Only throw if the user explicitly typed a code (not admin-assigned)
            throw new https_1.HttpsError('not-found', 'Código de descuento no válido o expirado');
        }
    }
    else {
        // Show promo-code field in Checkout UI
        params.allow_promotion_codes = true;
    }
    const session = await stripe.checkout.sessions.create(params);
    return { url: session.url };
});
// ── createPortalSession ────────────────────────────────────────────────
exports.createPortalSession = (0, https_1.onCall)({ region: REGION, cors: true, invoker: 'public', secrets: [exports.stripeSecretKey] }, async (request) => {
    var _a, _b;
    const uid = (_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid;
    if (!uid)
        throw new https_1.HttpsError('unauthenticated', 'No autenticado');
    const db = (0, firestore_1.getFirestore)();
    const stripe = stripeClient();
    const userSnap = await db.collection('users').doc(uid).get();
    const customerId = (_b = userSnap.data()) === null || _b === void 0 ? void 0 : _b.stripe_customer_id;
    if (!customerId)
        throw new https_1.HttpsError('not-found', 'No hay ninguna suscripción asociada a tu cuenta');
    const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${APP_URL}/settings`,
    });
    return { url: session.url };
});
// ── cancelSubscription ────────────────────────────────────────────────
exports.cancelSubscription = (0, https_1.onCall)({ region: REGION, cors: true, invoker: 'public', secrets: [exports.stripeSecretKey, emailService_1.resendApiKey] }, async (request) => {
    var _a, _b, _c, _d, _e;
    const uid = (_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid;
    if (!uid)
        throw new https_1.HttpsError('unauthenticated', 'No autenticado');
    const { reason, feedback } = request.data;
    const db = (0, firestore_1.getFirestore)();
    const stripe = stripeClient();
    const userSnap = await db.collection('users').doc(uid).get();
    const user = userSnap.data();
    if (!user)
        throw new https_1.HttpsError('not-found', 'Usuario no encontrado');
    const subscriptionId = user.subscription_id;
    if (!subscriptionId)
        throw new https_1.HttpsError('not-found', 'No tienes una suscripción activa');
    // Cancel at period end — user keeps access until the billing cycle ends
    const subscription = await stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: true,
    });
    const periodEndMs = subscription.current_period_end * 1000;
    const isTrial = subscription.status === 'trialing';
    await db.collection('users').doc(uid).update({
        subscription_cancel_at_period_end: true,
        cancellation_reason: reason || null,
        cancellation_feedback: feedback || null,
    });
    // Save to cancellations collection for admin analytics
    await db.collection('cancellations').add({
        uid,
        email: (_b = user.email) !== null && _b !== void 0 ? _b : null,
        first_name: (_c = user.first_name) !== null && _c !== void 0 ? _c : null,
        last_name: (_d = user.last_name) !== null && _d !== void 0 ? _d : null,
        reason,
        reason_label: (_e = REASON_LABELS[reason]) !== null && _e !== void 0 ? _e : reason,
        feedback: feedback || null,
        cancelled_at: firestore_1.Timestamp.now(),
        was_trial: isTrial,
        period_end_ms: periodEndMs,
    });
    // Send offboarding email (best-effort)
    if (user.email) {
        try {
            await (0, emailService_1.sendOffboardingEmail)(user.email, user.first_name || '', periodEndMs, isTrial);
            console.log(`[cancelSubscription] Offboarding email sent to: ${user.email}`);
        }
        catch (err) {
            console.error('[cancelSubscription] Failed to send offboarding email:', err);
        }
    }
    console.log(`[cancelSubscription] uid=${uid} reason=${reason} periodEnd=${periodEndMs}`);
    return { success: true, periodEndMs, isTrial };
});
// ── validateDiscountCode ───────────────────────────────────────────────
exports.validateDiscountCode = (0, https_1.onCall)({ region: REGION, cors: true, invoker: 'public', secrets: [exports.stripeSecretKey] }, async (request) => {
    var _a, _b, _c, _d;
    const uid = (_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid;
    if (!uid)
        throw new https_1.HttpsError('unauthenticated', 'No autenticado');
    const { code } = request.data;
    if (!(code === null || code === void 0 ? void 0 : code.trim()))
        throw new https_1.HttpsError('invalid-argument', 'Falta el código');
    const stripe = stripeClient();
    const promos = await stripe.promotionCodes.list({
        code: code.toUpperCase().trim(),
        active: true,
        limit: 1,
    });
    if (promos.data.length === 0)
        return { valid: false };
    const coupon = promos.data[0].coupon;
    return {
        valid: true,
        discountType: coupon.percent_off ? 'percentage' : 'fixed',
        discountValue: (_b = coupon.percent_off) !== null && _b !== void 0 ? _b : (coupon.amount_off ? coupon.amount_off / 100 : 0),
        currency: (_c = coupon.currency) !== null && _c !== void 0 ? _c : 'eur',
        duration: coupon.duration,
        durationInMonths: (_d = coupon.duration_in_months) !== null && _d !== void 0 ? _d : null,
    };
});
//# sourceMappingURL=stripe.js.map