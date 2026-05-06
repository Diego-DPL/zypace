"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.weeklyEmailSummary = exports.dailyRaceReminder = exports.onPlanCreated = exports.onIncidentUpdated = exports.onUserCreated = exports.adminDeletePlan = exports.adminDeleteUser = exports.adminBanUser = exports.deleteStravaWebhook = exports.registerStravaWebhook = exports.getStravaWebhookStatus = exports.stravaWebhookHandler = exports.generateNextMesocycle = exports.generatePlan = exports.analyzeWeek = exports.calibrateZones = exports.syncStrava = exports.stravaExchangeToken = void 0;
const admin = __importStar(require("firebase-admin"));
admin.initializeApp();
var stravaOAuth_1 = require("./stravaOAuth");
Object.defineProperty(exports, "stravaExchangeToken", { enumerable: true, get: function () { return stravaOAuth_1.stravaExchangeToken; } });
var syncStrava_1 = require("./syncStrava");
Object.defineProperty(exports, "syncStrava", { enumerable: true, get: function () { return syncStrava_1.syncStrava; } });
var calibrateZones_1 = require("./calibrateZones");
Object.defineProperty(exports, "calibrateZones", { enumerable: true, get: function () { return calibrateZones_1.calibrateZones; } });
var analyzeWeek_1 = require("./analyzeWeek");
Object.defineProperty(exports, "analyzeWeek", { enumerable: true, get: function () { return analyzeWeek_1.analyzeWeek; } });
var generatePlan_1 = require("./generatePlan");
Object.defineProperty(exports, "generatePlan", { enumerable: true, get: function () { return generatePlan_1.generatePlan; } });
var generateNextMesocycle_1 = require("./generateNextMesocycle");
Object.defineProperty(exports, "generateNextMesocycle", { enumerable: true, get: function () { return generateNextMesocycle_1.generateNextMesocycle; } });
var stravaWebhook_1 = require("./stravaWebhook");
Object.defineProperty(exports, "stravaWebhookHandler", { enumerable: true, get: function () { return stravaWebhook_1.stravaWebhookHandler; } });
var stravaWebhookAdmin_1 = require("./stravaWebhookAdmin");
Object.defineProperty(exports, "getStravaWebhookStatus", { enumerable: true, get: function () { return stravaWebhookAdmin_1.getStravaWebhookStatus; } });
Object.defineProperty(exports, "registerStravaWebhook", { enumerable: true, get: function () { return stravaWebhookAdmin_1.registerStravaWebhook; } });
Object.defineProperty(exports, "deleteStravaWebhook", { enumerable: true, get: function () { return stravaWebhookAdmin_1.deleteStravaWebhook; } });
var adminActions_1 = require("./adminActions");
Object.defineProperty(exports, "adminBanUser", { enumerable: true, get: function () { return adminActions_1.adminBanUser; } });
Object.defineProperty(exports, "adminDeleteUser", { enumerable: true, get: function () { return adminActions_1.adminDeleteUser; } });
Object.defineProperty(exports, "adminDeletePlan", { enumerable: true, get: function () { return adminActions_1.adminDeletePlan; } });
var triggers_1 = require("./triggers");
Object.defineProperty(exports, "onUserCreated", { enumerable: true, get: function () { return triggers_1.onUserCreated; } });
Object.defineProperty(exports, "onIncidentUpdated", { enumerable: true, get: function () { return triggers_1.onIncidentUpdated; } });
Object.defineProperty(exports, "onPlanCreated", { enumerable: true, get: function () { return triggers_1.onPlanCreated; } });
var scheduled_1 = require("./scheduled");
Object.defineProperty(exports, "dailyRaceReminder", { enumerable: true, get: function () { return scheduled_1.dailyRaceReminder; } });
Object.defineProperty(exports, "weeklyEmailSummary", { enumerable: true, get: function () { return scheduled_1.weeklyEmailSummary; } });
//# sourceMappingURL=index.js.map