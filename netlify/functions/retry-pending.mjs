import menu from '../../public/menu.json' with { type: 'json' };
import { makeHandlers } from './_lib/core.mjs';
import { realDeps } from './_lib/real.mjs';

const h = makeHandlers(realDeps(menu));
export default async () => { const r = await h.retryPending(); console.log(JSON.stringify({ type: 'retry_run', processed: r.length })); };

// Every 10 minutes.
export const config = { schedule: '*/10 * * * *' };
