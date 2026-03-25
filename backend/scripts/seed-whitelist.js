import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

// Resolve path to service-whitelist.json (two levels up from backend/scripts/)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const whitelistPath = path.resolve(__dirname, '../../src/data/service-whitelist.json');

// Parse CLI args: look for --table <name>
const args = process.argv;
const tableArgIndex = args.indexOf('--table');
const tableName = tableArgIndex !== -1 ? args[tableArgIndex + 1] : process.env.WHITELIST_TABLE;

if (!tableName) {
  console.error('Error: table name is required. Use --table <name> or set WHITELIST_TABLE env var.');
  process.exit(1);
}

// Read and parse the whitelist JSON
const jsonStr = readFileSync(whitelistPath, 'utf-8');
const data = JSON.parse(jsonStr);

// Compute MD5 etag
const etag = createHash('md5').update(jsonStr).digest('hex');

// Seed to DynamoDB
const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

await docClient.send(new PutCommand({
  TableName: tableName,
  Item: {
    id: 'singleton',
    data,
    updatedAt: new Date().toISOString(),
    etag,
  },
}));

console.log(`Seeded whitelist to table: ${tableName}`);
