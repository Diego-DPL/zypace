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
