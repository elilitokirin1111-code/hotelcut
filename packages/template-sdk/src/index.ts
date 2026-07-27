import { z } from 'zod';

import { templateInputSchema, templateOutputSchema } from './schema.js';

export * from './determinism.js';
export * from './execution.js';
export * from './schema.js';

export const templateInputJsonSchema = z.toJSONSchema(templateInputSchema, {
  target: 'draft-2020-12',
  unrepresentable: 'any',
});

export const templateOutputJsonSchema = z.toJSONSchema(templateOutputSchema, {
  target: 'draft-2020-12',
  unrepresentable: 'any',
});
