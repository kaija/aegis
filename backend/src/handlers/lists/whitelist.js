import { ok, internalError } from '../../lib/response.js';
import { dynamo } from '../../lib/dynamo.js';
import { config } from '../../config.js';
import { GetCommand } from '@aws-sdk/lib-dynamodb';

export const handler = async (_event) => {
  try {
    const result = await dynamo.send(
      new GetCommand({
        TableName: config.WHITELIST_TABLE,
        Key: { id: 'singleton' },
      })
    );

    const item = result.Item;
    if (!item) {
      console.error('Whitelist singleton record not found');
      return internalError();
    }

    return ok(item.data, {
      'Cache-Control': 'public, max-age=86400',
      'ETag': item.etag,
      'Content-Type': 'application/json',
    });
  } catch (err) {
    console.error(err);
    return internalError();
  }
};
