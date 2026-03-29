import { createReadStream } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { createInterface } from 'readline';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// CLI args: --table <name> --file <path>
const args = process.argv;
const tableArgIndex = args.indexOf('--table');
const tableName = tableArgIndex !== -1 ? args[tableArgIndex + 1] : process.env.URL_FEEDBACK_TABLE;
const fileArgIndex = args.indexOf('--file');
const filePath = fileArgIndex !== -1
  ? path.resolve(args[fileArgIndex + 1])
  : path.resolve(__dirname, '../../aegis-url-history-2026-03-25.csv');

if (!tableName) {
  console.error('Error: table name is required. Use --table <name> or set URL_FEEDBACK_TABLE env var.');
  process.exit(1);
}

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const rl = createInterface({ input: createReadStream(filePath), crlfDelay: Infinity });

let headerSkipped = false;
let written = 0;
let skipped = 0;

for await (const line of rl) {
  if (!headerSkipped) { headerSkipped = true; continue; }
  if (!line.trim()) continue;

  // Parse CSV line — fields may be quoted
  const cols = line.match(/(".*?"|[^,]+)(?=,|$)/g)?.map(f => f.replace(/^"|"$/g, '').trim()) ?? [];
  const [timestamp, date, domain, category, , url] = cols;

  if (!url || !domain || !category) { skipped++; continue; }

  await docClient.send(new PutCommand({
    TableName: tableName,
    Item: {
      id: uuidv4(),
      createdAt: date || new Date(Number(timestamp)).toISOString(),
      url,
      domain,
      suggestedCategory: category,
      currentCategory: category,
      extensionVersion: 'history-seed',
    },
  }));
  written++;
}

console.log(`Done. Written: ${written}, Skipped: ${skipped}`);
