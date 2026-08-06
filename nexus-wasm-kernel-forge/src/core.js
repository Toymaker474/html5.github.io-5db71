// SPDX-License-Identifier: MIT

export function parseRuleCode(value) {
  const match = /^\s*B([0-8]*)\s*\/\s*S([0-8]*)\s*$/i.exec(String(value));
  if (!match) {
    const error = new Error('Rule must use B.../S... with neighbor digits 0 through 8.');
    error.code = 'RULE_INVALID';
    throw error;
  }
  const toMask = digits => [...new Set(digits.split(''))]
    .reduce((mask, digit) => mask | (1 << Number(digit)), 0);
  return { birth: toMask(match[1]), survive: toMask(match[2]) };
}

export function createRandom(seed = 0x4e455855) {
  let state = Number(seed) >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x1_0000_0000;
  };
}

export function seedCells(target, density, seed) {
  const random = createRandom(seed);
  for (let index = 0; index < target.length; index += 1) {
    target[index] = random() < density ? 1 : 0;
  }
  return target;
}

export function jsCellularStep(source, destination, width, height, birthMask, survivalMask) {
  let living = 0;
  const wrapX = value => (value + width) % width;
  const wrapY = value => (value + height) % height;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let neighbors = 0;
      for (let oy = -1; oy <= 1; oy += 1) {
        for (let ox = -1; ox <= 1; ox += 1) {
          if (ox === 0 && oy === 0) continue;
          neighbors += source[wrapY(y + oy) * width + wrapX(x + ox)];
        }
      }
      const index = y * width + x;
      const mask = source[index] ? survivalMask : birthMask;
      const next = (mask >>> neighbors) & 1;
      destination[index] = next;
      living += next;
    }
  }
  return living;
}

export function scoreWorld(cells, previous, width, height) {
  let living = 0;
  let changed = 0;
  let edges = 0;
  const total = width * height;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const value = cells[index];
      living += value;
      if (previous && value !== previous[index]) changed += 1;
      if (value !== cells[y * width + ((x + 1) % width)]) edges += 1;
      if (value !== cells[((y + 1) % height) * width + x]) edges += 1;
    }
  }
  const ratio = living / total;
  const entropy = ratio > 0 && ratio < 1
    ? -(ratio * Math.log2(ratio) + (1 - ratio) * Math.log2(1 - ratio))
    : 0;
  const edgeRatio = edges / (total * 2);
  const changeRatio = previous ? changed / total : 0;
  const extinctionPenalty = ratio < 0.015 || ratio > 0.985 ? 2 : 0;
  return {
    score: entropy * 1.7 + edgeRatio * 1.25 + changeRatio * 0.9 - extinctionPenalty,
    living,
    ratio,
    entropy,
    edgeRatio,
    changeRatio,
  };
}

export function candidateRule(random) {
  let birth = 0;
  let survive = 0;
  for (let neighbors = 1; neighbors <= 8; neighbors += 1) {
    if (random() < 0.28) birth |= 1 << neighbors;
    if (random() < 0.38) survive |= 1 << neighbors;
  }
  if (birth === 0) birth = 1 << (2 + Math.floor(random() * 3));
  return { birth, survive };
}
