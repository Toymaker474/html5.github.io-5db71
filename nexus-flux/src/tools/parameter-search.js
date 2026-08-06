import { DeterministicRng } from './deterministic-rng.js';
export async function searchParameters({ genes, evaluate, seed = 1, population = 12, generations = 5, elite = 3, onGeneration }) {
  const rng = new DeterministicRng(seed);
  const randomGenome = () => Object.fromEntries(Object.entries(genes).map(([name, spec]) => [name, rng.range(spec.min, spec.max)]));
  let pool = Array.from({ length: population }, randomGenome); let best = null;
  for (let generation = 0; generation < generations; generation += 1) {
    const ranked = [];
    for (const genome of pool) {
      const result = await evaluate({ ...genome });
      if (!Number.isFinite(result.score)) throw new Error('PARAMETER_SEARCH_NONFINITE_SCORE');
      ranked.push({ genome, ...result });
    }
    ranked.sort((a, b) => b.score - a.score); best = !best || ranked[0].score > best.score ? ranked[0] : best;
    onGeneration?.({ generation, best, ranked });
    const parents = ranked.slice(0, Math.max(1, elite));
    pool = Array.from({ length: population }, (_, index) => {
      if (index < parents.length) return { ...parents[index].genome };
      const a = rng.pick(parents).genome; const b = rng.pick(parents).genome; const child = {};
      for (const [name, spec] of Object.entries(genes)) {
        const span = spec.max - spec.min; const base = rng.next() < 0.5 ? a[name] : b[name];
        child[name] = Math.max(spec.min, Math.min(spec.max, base + rng.range(-0.12, 0.12) * span));
      }
      return child;
    });
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  return { schema: 'nexus.flux.parameter-search.v1', modelClaim: false, best };
}
