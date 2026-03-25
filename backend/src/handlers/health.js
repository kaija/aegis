import { ok, internalError } from '../lib/response.js';

export const handler = async (_event) => {
  try {
    return ok({ status: 'ok', timestamp: new Date().toISOString() });
  } catch (err) {
    console.error(err);
    return internalError();
  }
};
