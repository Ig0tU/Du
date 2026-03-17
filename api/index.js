"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const server_1 = require("../src/api/server");
const helpers_1 = require("../src/api/tests/helpers");
// In a Vercel environment, we don't have a real Electron window or managers.
// We use a mock context that returns sensible defaults for the API.
const ctx = (0, helpers_1.createMockContext)();
// Ensure the API knows it's running in serverless mode
const tandemApi = new server_1.TandemAPI({
    win: ctx.win,
    registry: ctx,
});
// Export the Express app for Vercel
exports.default = tandemApi.getApp();
//# sourceMappingURL=index.js.map