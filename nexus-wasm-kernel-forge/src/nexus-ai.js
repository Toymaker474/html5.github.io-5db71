// SPDX-License-Identifier: MIT

function randomFactory(seed = 0x4e455855) {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x1_0000_0000;
  };
}

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
const yieldFrame = () => new Promise(resolve => {
  if (typeof globalThis.requestAnimationFrame === 'function') {
    globalThis.requestAnimationFrame(() => resolve());
  } else {
    setTimeout(resolve, 0);
  }
});

export class EvolutionSearch {
  constructor({ genes, population = 8, generations = 3, seed = 0x4e455855, elite = 2 }) {
    this.genes = genes;
    this.populationSize = population;
    this.generations = generations;
    this.elite = Math.max(1, Math.min(elite, population));
    this.random = randomFactory(seed);
  }

  #randomGenome() {
    return Object.fromEntries(Object.entries(this.genes).map(([name, gene]) => {
      const value = gene.minimum + this.random() * (gene.maximum - gene.minimum);
      return [name, gene.integer ? Math.round(value) : value];
    }));
  }

  #mutate(parent, amount = 0.18) {
    const child = { ...parent };
    for (const [name, gene] of Object.entries(this.genes)) {
      if (this.random() > 0.68) continue;
      const range = gene.maximum - gene.minimum;
      const value = child[name] + (this.random() * 2 - 1) * range * amount;
      child[name] = gene.integer ? Math.round(clamp(value, gene.minimum, gene.maximum)) : clamp(value, gene.minimum, gene.maximum);
    }
    return child;
  }

  #cross(a, b) {
    return Object.fromEntries(Object.keys(this.genes).map(name => [name, this.random() < 0.5 ? a[name] : b[name]]));
  }

  async run(evaluate, onProgress = () => {}) {
    let population = Array.from({ length: this.populationSize }, () => this.#randomGenome());
    const history = [];
    for (let generation = 0; generation < this.generations; generation += 1) {
      const scored = [];
      for (let index = 0; index < population.length; index += 1) {
        const genome = population[index];
        const result = await evaluate(genome, { generation, index });
        scored.push({ genome, ...result });
        onProgress({ generation, index, population: population.length, best: scored.reduce((a, b) => !a || b.score > a.score ? b : a, null) });
        await yieldFrame();
      }
      scored.sort((a, b) => b.score - a.score);
      history.push(scored.map(item => ({ genome: item.genome, score: item.score, metrics: item.metrics })));
      const elites = scored.slice(0, this.elite).map(item => item.genome);
      population = [...elites];
      while (population.length < this.populationSize) {
        const first = elites[Math.floor(this.random() * elites.length)];
        const second = scored[Math.floor(this.random() * Math.max(this.elite + 2, scored.length))].genome;
        population.push(this.#mutate(this.#cross(first, second)));
      }
    }
    const finalists = history.at(-1).slice().sort((a, b) => b.score - a.score);
    return {
      schema: 'nexus.ai.evolution-report.v1',
      algorithm: 'deterministic evolutionary parameter search',
      generations: this.generations,
      population: this.populationSize,
      best: finalists[0],
      history,
      modelClaim: false,
    };
  }
}

export async function tuneFluid(engine, { targetMilliseconds = 18, seed = 0x564f5254, onProgress } = {}) {
  const originalState = engine.snapshot();
  const originalConfig = { ...engine.config };
  const search = new EvolutionSearch({
    seed,
    population: 7,
    generations: 3,
    elite: 2,
    genes: {
      pressureIterations: { minimum: 8, maximum: 26, integer: true },
      vorticity: { minimum: 6, maximum: 48 },
      decay: { minimum: 0.992, maximum: 0.9994 },
      timestep: { minimum: 0.45, maximum: 0.95 },
    },
  });

  const report = await search.run(async genome => {
    engine.restore(originalState);
    Object.assign(engine.config, genome);
    const stepTimes = [];
    for (let step = 0; step < 6; step += 1) {
      const metrics = engine.step();
      stepTimes.push(metrics.stepMilliseconds);
    }
    const metrics = engine.metrics();
    const averageMilliseconds = stepTimes.reduce((sum, value) => sum + value, 0) / stepTimes.length;
    const complexity = Math.log1p(Math.max(0, metrics.sampledColorGradient));
    const motion = Math.log1p(Math.max(0, metrics.kineticEnergy));
    const visibleMass = Math.log1p(Math.max(0, metrics.sampledDyeMass));
    const performancePenalty = Math.max(0, averageMilliseconds - targetMilliseconds) * 0.18;
    const instabilityPenalty = !Number.isFinite(motion + complexity + visibleMass) ? 1000 : 0;
    return {
      score: complexity * 0.55 + motion * 0.3 + visibleMass * 0.15 - performancePenalty - instabilityPenalty,
      metrics: { ...metrics, averageMilliseconds },
    };
  }, onProgress);

  engine.restore(originalState);
  Object.assign(engine.config, originalConfig, report.best.genome);
  return report;
}
