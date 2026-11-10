import menu from '../../public/menu.json' with { type: 'json' };
import { makeHandlers } from './_lib/core.mjs';
import { realDeps } from './_lib/real.mjs';

const h = makeHandlers(realDeps(menu));
export default (req, context) => h.order(req, context);

// Netlify enforces this limit per visitor address before the function runs.
export const config = {
  path: '/api/order',
  method: 'POST',
  rateLimit: { windowLimit: 8, windowSize: 60, aggregateBy: ['ip', 'domain'] }
};
