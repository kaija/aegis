import { created, badRequest, internalError } from '../../lib/response.js';
import { isValidDomain, sanitizeUrlDomains } from '../../lib/validation.js';
import { dynamo } from '../../lib/dynamo.js';
import { config } from '../../config.js';
import { validateRequest } from '../../middleware/validateRequest.js';
import { v4 as uuidv4 } from 'uuid';
import { PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

export const handler = async (event) => {
  try {
    const validationError = validateRequest(event);
    if (validationError !== null) return validationError;

    const body = JSON.parse(event.body);

    const { senderDomain, companyName, urlDomains } = body;

    if (!senderDomain || typeof senderDomain !== 'string' || !isValidDomain(senderDomain)) {
      return badRequest('Missing or invalid senderDomain');
    }
    if (!Array.isArray(urlDomains) || urlDomains.length === 0) {
      return badRequest('Missing or invalid urlDomains');
    }
    if (companyName !== undefined && companyName !== null && typeof companyName !== 'string') {
      return badRequest('Invalid companyName');
    }

    const sanitizedDomains = sanitizeUrlDomains(urlDomains);
    const now = new Date().toISOString();

    const headers = event.headers ?? {};
    const versionKey = Object.keys(headers).find(
      (k) => k.toLowerCase() === 'x-extension-version'
    );
    const extensionVersion = versionKey ? headers[versionKey] : undefined;

    // Write raw feedback record
    await dynamo.send(
      new PutCommand({
        TableName: config.SENDER_MAPPING_FEEDBACK_TABLE,
        Item: {
          id: uuidv4(),
          createdAt: now,
          senderDomain,
          companyName: companyName ?? null,
          urlDomains: sanitizedDomains,
          extensionVersion,
        },
      })
    );

    // Initialize mapping record if it doesn't exist yet
    try {
      await dynamo.send(
        new PutCommand({
          TableName: config.SENDER_DOMAIN_MAPPING_TABLE,
          Item: {
            senderDomain,
            companyName: companyName ?? null,
            urlDomainCounts: {},
            submissionCount: 0,
            createdAt: now,
            updatedAt: now,
          },
          ConditionExpression: 'attribute_not_exists(senderDomain)',
        })
      );
    } catch (err) {
      if (err.name !== 'ConditionalCheckFailedException') throw err;
    }

    // Build a single UpdateExpression to increment all URL domain counts at once
    const exprNames = {
      '#sc': 'submissionCount',
      '#ua': 'updatedAt',
      '#c': 'urlDomainCounts',
    };
    const exprValues = {
      ':one': 1,
      ':zero': 0,
      ':now': now,
    };
    const setClauses = [
      '#sc = if_not_exists(#sc, :zero) + :one',
      '#ua = :now',
    ];

    if (companyName) {
      exprNames['#cn'] = 'companyName';
      exprValues[':cn'] = companyName;
      setClauses.push('#cn = if_not_exists(#cn, :cn)');
    }

    sanitizedDomains.forEach((domain, i) => {
      const key = `#domain${i}`;
      exprNames[key] = domain;
      setClauses.push(`#c.${key} = if_not_exists(#c.${key}, :zero) + :one`);
    });

    await dynamo.send(
      new UpdateCommand({
        TableName: config.SENDER_DOMAIN_MAPPING_TABLE,
        Key: { senderDomain },
        UpdateExpression: 'SET ' + setClauses.join(', '),
        ExpressionAttributeNames: exprNames,
        ExpressionAttributeValues: exprValues,
      })
    );

    return created({ senderDomain });
  } catch (err) {
    console.error(err);
    return internalError();
  }
};
