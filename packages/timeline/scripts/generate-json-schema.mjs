import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import prettier from 'prettier';

import { hotelVideoProjectV1JsonSchema } from '../dist/index.js';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = resolve(packageRoot, 'schema', 'hotel-video-project-v1.schema.json');

await mkdir(dirname(outputPath), { recursive: true });
const schemaDocument = {
  ...hotelVideoProjectV1JsonSchema,
  $id: 'https://hotelcut.local/schemas/hotel-video-project-v1.schema.json',
  title: 'HotelVideoProject v1',
};
const prettierOptions = await prettier.resolveConfig(outputPath);
const formattedSchema = await prettier.format(JSON.stringify(schemaDocument), {
  ...prettierOptions,
  filepath: outputPath,
});

await writeFile(outputPath, formattedSchema, 'utf8');

process.stdout.write(`Generated ${outputPath}\n`);
