import * as admin from 'firebase-admin';

admin.initializeApp();

export { stravaExchangeToken } from './stravaOAuth';
export { syncStrava }          from './syncStrava';
export { calibrateZones }      from './calibrateZones';
export { analyzeWeek }         from './analyzeWeek';
export { generatePlan }            from './generatePlan';
export { generateNextMesocycle }   from './generateNextMesocycle';
export { stravaWebhookHandler }    from './stravaWebhook';
export { getStravaWebhookStatus, registerStravaWebhook, deleteStravaWebhook } from './stravaWebhookAdmin';
export { adminBanUser, adminDeleteUser, adminDeletePlan } from './adminActions';
export { onUserCreated, onIncidentUpdated, onPlanCreated } from './triggers';
export { dailyRaceReminder, weeklyEmailSummary, reactivationEmailJob } from './scheduled';
export { createCheckoutSession, createPortalSession, validateDiscountCode, cancelSubscription } from './stripe';
export { stripeWebhookHandler } from './stripeWebhook';
export { createDiscountCode, listDiscountCodes, toggleDiscountCode, setUserExempt, assignDiscountToUser } from './stripeAdmin';
export { createInvite, revokeInvite, listInvites } from './invites';
