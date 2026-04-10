import { TandemAPI } from '../src/api/server';
import { createProductionContext } from '../src/api/context';

// In a Vercel environment, we don't have a real Electron window or managers.
// We use a production context that returns sensible no-op defaults.
const ctx = createProductionContext();

// Ensure the API knows it's running in serverless mode
const tandemApi = new TandemAPI({
  win: ctx.win,
  registry: ctx,
});

// Export the Express app for Vercel
export default tandemApi.getApp();
