import { created, badRequest, internalError } from '../../lib/response.js';
import { isValidUrl, extractDomain } from '../../lib/validation.js';
import { dynamo } from '../../lib/dynamo.js';
import { config } from '../../config.js';
import { validateRequest } from '../../middleware/validateRequest.js';
import { v4 as uuidv4 } from 'uuid';
import { PutCommand } from '@aws-sdk/lib-dynamodb';

export const handler = async (event) => {
  try {
    const validationError = validateRequest(event);
    if (validationError !== null) return validationError;

    const body = JSON.parse(event.body);

    const { url, suggestedCategory, currentCategory } = body;

    if (!url || typeof url !== 'string' || !isValidUrl(url)) {
      return badRequest('Missing or invalid url');
    }
    if (!suggestedCategory || typeof suggestedCategory !== 'string') {
      return badRequest('Missing or invalid suggestedCategory');
    }
    if (!currentCategory || typeof currentCategory !== 'string') {
      return badRequest('Missing or invalid currentCategory');
    }

    const domain = extractDomain(url);
    const id = uuidv4();

    const headers = event.headers ?? {};
    const versionKey = Object.keys(headers).find(
      (k) => k.toLowerCase() === 'x-extension-version'
    );
    const extensionVersion = versionKey ? headers[versionKey] : undefined;

    await dynamo.send(
      new PutCommand({
        TableName: config.URL_FEEDBACK_TABLE,
        Item: {
          id,
          createdAt: new Date().toISOString(),
          url,
          domain,
          suggestedCategory,
          currentCategory,
          extensionVersion,
        },
      })
    );

    return created({ id });
  } catch (err) {
    console.error(err);
    return internalError();
  }
};
