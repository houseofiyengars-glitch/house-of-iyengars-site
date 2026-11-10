import menu from '../../public/menu.json' with { type: 'json' };
import { makeHandlers } from './_lib/core.mjs';
import { realDeps } from './_lib/real.mjs';

const h = makeHandlers(realDeps(menu));
export default (req, context) => h.handoff(req, context);

export const config = {
  path: '/api/handoff',
  method: 'POST',
  rateLimit: { windowLimit: 20, windowSize: 60, aggregateBy: ['ip', 'domain'] }
};
