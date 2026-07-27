import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compileVideo } from '@hotelcut/compiler';
import prettier from 'prettier';

import { hostBrollTemplate, promotionTemplate, roomMontageTemplate } from '../dist/index.js';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixturePath = resolve(packageRoot, 'fixtures', 'm4-compiler-input.json');
const outputDirectory = resolve(packageRoot, 'fixtures', 'golden');
const baseInput = JSON.parse(await readFile(fixturePath, 'utf8'));

const cases = [
  {
    name: 'host-broll',
    input: baseInput,
    template: hostBrollTemplate,
  },
  {
    name: 'room-montage',
    input: {
      ...baseInput,
      projectId: '21111111-1111-4111-8111-111111111111',
      template: { id: roomMontageTemplate.id, version: roomMontageTemplate.version },
      brief: {
        ...baseInput.brief,
        id: '25151515-1515-4515-8515-151515151515',
        title: '云栖酒店客房卖点',
        durationFrames: 750,
      },
      output: {
        ...baseInput.output,
        durationFrames: 750,
      },
      cta: {
        ...baseInput.cta,
        startFrame: 600,
        durationFrames: 150,
      },
    },
    template: roomMontageTemplate,
  },
  {
    name: 'promotion',
    input: {
      ...baseInput,
      projectId: '31111111-1111-4111-8111-111111111111',
      template: { id: promotionTemplate.id, version: promotionTemplate.version },
      brief: {
        ...baseInput.brief,
        id: '35151515-1515-4515-8515-151515151515',
        title: '云栖酒店周末礼遇',
        durationFrames: 600,
      },
      output: {
        ...baseInput.output,
        durationFrames: 600,
      },
      cta: {
        ...baseInput.cta,
        startFrame: 480,
        durationFrames: 120,
      },
    },
    template: promotionTemplate,
  },
];

await mkdir(outputDirectory, { recursive: true });
for (const fixtureCase of cases) {
  const result = compileVideo(fixtureCase.input, fixtureCase.template);
  const outputPath = resolve(outputDirectory, `${fixtureCase.name}.json`);
  const prettierOptions = await prettier.resolveConfig(outputPath);
  const formatted = await prettier.format(JSON.stringify(result), {
    ...prettierOptions,
    filepath: outputPath,
  });
  await writeFile(outputPath, formatted, 'utf8');
  process.stdout.write(`Generated ${outputPath}\n`);
}
