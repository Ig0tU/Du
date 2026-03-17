import { TandemAPI } from '../src/api/server';
import { createMockContext } from '../src/api/tests/helpers';

// In a Vercel environment, we don't have a real Electron window or managers.
// We use a mock context that returns sensible defaults for the API.
const ctx = createMockContext();

// Ensure the API knows it's running in serverless mode
const tandemApi = new TandemAPI({
  win: ctx.win,
  registry: ctx,
});

// Export the Express app for Vercel
export default tandemApi.getApp();
