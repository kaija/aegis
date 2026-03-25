import { badRequest } from '../lib/response.js';

export const validateRequest = (event) => {
  const headers = event.headers ?? {};

  // Case-insensitive lookup for X-Extension-Version
  const hasVersion = Object.keys(headers).some(
    (k) => k.toLowerCase() === 'x-extension-version'
  );
  if (!hasVersion) {
    return badRequest('Missing X-Extension-Version header');
  }

  // Check Content-Length if present
  const contentLengthKey = Object.keys(headers).find(
    (k) => k.toLowerCase() === 'content-length'
  );
  if (contentLengthKey !== undefined) {
    const contentLength = parseInt(headers[contentLengthKey], 10);
    if (!isNaN(contentLength) && contentLength > 10240) {
      return { statusCode: 413, body: JSON.stringify({ error: 'Request too large' }) };
    }
  }

  return null;
};
