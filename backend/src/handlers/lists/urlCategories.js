import { createHash } from 'crypto';
import { ok, internalError } from '../../lib/response.js';
import { dynamo } from '../../lib/dynamo.js';
import { config } from '../../config.js';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';

export const handler = async (_event) => {
  try {
    const result = await dynamo.send(
      new ScanCommand({ TableName: config.URL_FEEDBACK_TABLE })
    );

    const items = result.Items ?? [];

    // Group by domain: { domain -> { category -> count } }
    const domainCounts = {};
    for (const item of items) {
      const { domain, suggestedCategory } = item;
      if (!domain || !suggestedCategory) continue;
      if (!domainCounts[domain]) domainCounts[domain] = {};
      domainCounts[domain][suggestedCategory] =
        (domainCounts[domain][suggestedCategory] ?? 0) + 1;
    }

    // Assign category with highest count; lexicographic tiebreak
    const categories = {};
    for (const [domain, counts] of Object.entries(domainCounts)) {
      let bestCategory = null;
      let bestCount = -1;
      for (const [category, count] of Object.entries(counts)) {
        if (
          count > bestCount ||
          (count === bestCount && category < bestCategory)
        ) {
          bestCategory = category;
          bestCount = count;
        }
      }
      categories[domain] = bestCategory;
    }

    const responseBody = { categories, generatedAt: new Date().toISOString() };
    const bodyStr = JSON.stringify(responseBody);
    const etag = createHash('md5').update(bodyStr).digest('hex');

    return ok(responseBody, {
      'Cache-Control': 'public, max-age=3600',
      'ETag': etag,
      'Content-Type': 'application/json',
    });
  } catch (err) {
    console.error(err);
    return internalError();
  }
};
