import { createHash } from 'node:crypto';

import { stableStringify } from '@hotelcut/timeline';

function fnv1a(input: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function createMulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function hashToUuid(input: string): string {
  const bytes = Buffer.from(createHash('sha256').update(input).digest().subarray(0, 16));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export interface DeterministicTemplateContext {
  readonly seed: number;
  readonly inputHash: string;
  random(): number;
  integer(minimum: number, maximum: number): number;
  pick<T>(values: readonly T[]): T;
  id(namespace?: string): string;
}

export function createDeterministicTemplateContext(
  templateId: string,
  templateVersion: string,
  seed: number,
  input: unknown,
): DeterministicTemplateContext {
  const scope = `${templateId}@${templateVersion}:${seed}`;
  const random = createMulberry32(fnv1a(scope));
  const inputHash = createHash('sha256').update(stableStringify(input, 0)).digest('hex');
  let idCounter = 0;

  return {
    seed,
    inputHash,
    random,
    integer(minimum, maximum) {
      if (!Number.isInteger(minimum) || !Number.isInteger(maximum) || maximum < minimum) {
        throw new RangeError('integer() expects an inclusive integer range');
      }
      return minimum + Math.floor(random() * (maximum - minimum + 1));
    },
    pick<T>(values: readonly T[]): T {
      if (values.length === 0) {
        throw new RangeError('pick() requires at least one value');
      }
      const selected = values[Math.floor(random() * values.length)];
      if (selected === undefined) {
        throw new RangeError('pick() could not select a value');
      }
      return selected;
    },
    id(namespace = 'node') {
      const id = hashToUuid(`${scope}:${namespace}:${idCounter}`);
      idCounter += 1;
      return id;
    },
  };
}
