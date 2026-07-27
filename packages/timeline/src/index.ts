import { z } from 'zod';

import { hotelVideoProjectV1Schema } from './schema.js';

export * from './migration.js';
export * from './otio.js';
export * from './schema.js';
export * from './stable-json.js';
export * from './validation.js';

export const hotelVideoProjectV1JsonSchema = z.toJSONSchema(hotelVideoProjectV1Schema, {
  target: 'draft-2020-12',
  unrepresentable: 'any',
});
