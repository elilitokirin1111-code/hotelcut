import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { serializeHotelVideoProjectToOtio } from '../dist/index.js';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const inputPath = resolve(packageRoot, 'fixtures', 'hotel-video-project-v1.json');
const outputPath = resolve(packageRoot, 'fixtures', 'basic-timeline.otio');
const project = JSON.parse(await readFile(inputPath, 'utf8'));

await writeFile(outputPath, `${serializeHotelVideoProjectToOtio(project)}\n`, 'utf8');
process.stdout.write(`Generated ${outputPath}\n`);
