"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assignDiscountToUser = exports.setUserExempt = exports.toggleDiscountCode = exports.listDiscountCodes = exports.createDiscountCode = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
/* eslint-disable @typescript-eslint/no-require-imports */
const Stripe = require('stripe');
const stripe_1 = require("./stripe");
const REGION = 'europe-west1';
async function assertAdmin(uid) {
    var _a;
    if (!uid)
        throw new https_1.HttpsError('unauthenticated', 'No autenticado');
    const doc = await (0, firestore_1.getFirestore)().collection('users').doc(uid).get();
    if (((_a = doc.data()) === null || _a === void 0 ? void 0 : _a.role) !== 'admin') {
        throw new https_1.HttpsError('permission-denied', 'Solo administradores');
    }
}
function stripeClient() {
    return new Stripe(stripe_1.stripeSecretKey.value(), { apiVersion: '2026-04-22.dahlia' });
}
// ── createDiscountCode ────────────────────────────────────────────────
exports.createDiscountCode = (0, https_1.onCall)({ region: REGION, cors: true, invoker: 'public', secrets: [stripe_1.stripeSecretKey] }, async (request) => {
    var _a;
    await assertAdmin((_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid);
    const { code, discountType, discountValue, maxRedemptions, duration, durationInMonths, expiresAt, } = request.data;
    if (!(code === null || code === void 0 ? void 0 : code.trim()))
        throw new https_1.HttpsError('invalid-argument', 'Falta el código');
    if (!discountValue || discountValue <= 0)
        throw new https_1.HttpsError('invalid-argument', 'El descuento debe ser mayor que cero');
    if (discountType === 'percentage' && discountValue > 100)
        throw new https_1.HttpsError('invalid-argument', 'El porcentaje no puede superar 100');
    if (duration === 'repeating' && (!durationInMonths || durationInMonths < 1)) {
        throw new https_1.HttpsError('invalid-argument', 'Indica el número de meses para la duración "repeating"');
    }
    const db = (0, firestore_1.getFirestore)();
    const stripe = stripeClient();
    const normalizedCode = code.toUpperCase().trim();
    const existing = await db.collection('discount_codes')
        .where('code', '==', normalizedCode)
        .limit(1)
        .get();
    if (!existing.empty)
        throw new https_1.HttpsError('already-exists', 'Ya existe un código con ese nombre');
    // Create Stripe coupon
    const couponParams = {
        name: normalizedCode,
        duration,
        currency: 'eur',
    };
    if (discountType === 'percentage') {
        couponParams.percent_off = discountValue;
    }
    else {
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
    const promoParams = {
        coupon: coupon.id,
        code: normalizedCode,
    };
    if (maxRedemptions !== null && maxRedemptions > 0)
        promoParams.max_redemptions = maxRedemptions;
    if (expiresAt)
        promoParams.expires_at = Math.floor(new Date(expiresAt).getTime() / 1000);
    const promo = await stripe.promotionCodes.create(promoParams);
    const codeRef = await db.collection('discount_codes').add({
        code: normalizedCode,
        stripe_coupon_id: coupon.id,
        stripe_promotion_code_id: promo.id,
        discount_type: discountType,
        discount_value: discountValue,
        max_redemptions: maxRedemptions !== null && maxRedemptions !== void 0 ? maxRedemptions : null,
        duration,
        duration_in_months: durationInMonths !== null && durationInMonths !== void 0 ? durationInMonths : null,
        active: true,
        created_at: firestore_1.Timestamp.now(),
        expires_at: expiresAt ? firestore_1.Timestamp.fromDate(new Date(expiresAt)) : null,
    });
    console.log(`[createDiscountCode] Created code: ${normalizedCode} (${codeRef.id})`);
    return { id: codeRef.id, code: normalizedCode };
});
// ── listDiscountCodes ─────────────────────────────────────────────────
exports.listDiscountCodes = (0, https_1.onCall)({ region: REGION, cors: true, invoker: 'public' }, async (request) => {
    var _a;
    await assertAdmin((_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid);
    const snap = await (0, firestore_1.getFirestore)()
        .collection('discount_codes')
        .orderBy('created_at', 'desc')
        .get();
    return snap.docs.map(d => {
        var _a, _b, _c, _d;
        const data = d.data();
        return {
            id: d.id,
            code: data.code,
            discount_type: data.discount_type,
            discount_value: data.discount_value,
            max_redemptions: data.max_redemptions,
            duration: data.duration,
            duration_in_months: data.duration_in_months,
            active: data.active,
            created_at: (_b = (_a = data.created_at) === null || _a === void 0 ? void 0 : _a.toMillis()) !== null && _b !== void 0 ? _b : null,
            expires_at: (_d = (_c = data.expires_at) === null || _c === void 0 ? void 0 : _c.toMillis()) !== null && _d !== void 0 ? _d : null,
            stripe_coupon_id: data.stripe_coupon_id,
            stripe_promotion_code_id: data.stripe_promotion_code_id,
        };
    });
});
// ── toggleDiscountCode ────────────────────────────────────────────────
exports.toggleDiscountCode = (0, https_1.onCall)({ region: REGION, cors: true, invoker: 'public', secrets: [stripe_1.stripeSecretKey] }, async (request) => {
    var _a, _b;
    await assertAdmin((_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid);
    const { codeId, active } = request.data;
    if (!codeId)
        throw new https_1.HttpsError('invalid-argument', 'Falta codeId');
    const db = (0, firestore_1.getFirestore)();
    const stripe = stripeClient();
    const codeDoc = await db.collection('discount_codes').doc(codeId).get();
    if (!codeDoc.exists)
        throw new https_1.HttpsError('not-found', 'Código no encontrado');
    const promoId = (_b = codeDoc.data()) === null || _b === void 0 ? void 0 : _b.stripe_promotion_code_id;
    if (promoId)
        await stripe.promotionCodes.update(promoId, { active });
    await db.collection('discount_codes').doc(codeId).update({ active });
    return { success: true };
});
// ── setUserExempt ─────────────────────────────────────────────────────
exports.setUserExempt = (0, https_1.onCall)({ region: REGION, cors: true, invoker: 'public' }, async (request) => {
    var _a;
    await assertAdmin((_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid);
    const { targetUid, exempt } = request.data;
    if (!targetUid)
        throw new https_1.HttpsError('invalid-argument', 'Falta targetUid');
    const userRef = (0, firestore_1.getFirestore)().collection('users').doc(targetUid);
    const snap = await userRef.get();
    if (!snap.exists)
        throw new https_1.HttpsError('not-found', 'Usuario no encontrado');
    await userRef.update({ is_exempt: exempt });
    console.log(`[setUserExempt] uid=${targetUid} exempt=${exempt}`);
    return { success: true };
});
// ── assignDiscountToUser ──────────────────────────────────────────────
exports.assignDiscountToUser = (0, https_1.onCall)({ region: REGION, cors: true, invoker: 'public', secrets: [stripe_1.stripeSecretKey] }, async (request) => {
    var _a;
    await assertAdmin((_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid);
    const { targetUid, promoCode } = request.data;
    if (!targetUid)
        throw new https_1.HttpsError('invalid-argument', 'Falta targetUid');
    const db = (0, firestore_1.getFirestore)();
    if (promoCode) {
        const stripe = stripeClient();
        const promos = await stripe.promotionCodes.list({
            code: promoCode.toUpperCase().trim(),
            active: true,
            limit: 1,
        });
        if (promos.data.length === 0)
            throw new https_1.HttpsError('not-found', 'Código no válido o inactivo');
    }
    await db.collection('users').doc(targetUid).update({
        admin_promo_code: promoCode ? promoCode.toUpperCase().trim() : null,
    });
    console.log(`[assignDiscountToUser] uid=${targetUid} code=${promoCode !== null && promoCode !== void 0 ? promoCode : 'none'}`);
    return { success: true };
});
//# sourceMappingURL=stripeAdmin.js.map