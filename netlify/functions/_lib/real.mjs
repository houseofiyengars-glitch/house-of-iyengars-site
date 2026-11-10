// Real (production) dependencies. Kept tiny because it cannot run outside Netlify.
export function realDeps(menu) {
  return {
    menu,
    getEnv: n => process.env[n],
    fetch: (...a) => fetch(...a),
    now: () => new Date(),
    log: s => console.warn(s),
    store: async () => {
      const { getStore } = await import('@netlify/blobs');
      return getStore({ name: 'pending-orders', consistency: 'strong' });
    }
  };
}
