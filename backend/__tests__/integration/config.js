const STAGES = {
  dev: 'https://aegis.dev.penrose.services',
  prod: 'https://aegis.penrose.services',
};

const stage = process.env.STAGE ?? 'dev';

if (!STAGES[stage]) {
  throw new Error(`Unknown STAGE: "${stage}". Valid values: ${Object.keys(STAGES).join(', ')}`);
}

export const BASE_URL = STAGES[stage];
export const STAGE = stage;
