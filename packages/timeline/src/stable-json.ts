import { parseHotelVideoProject } from './validation.js';

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sortJsonValue(item));
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entryValue]) => entryValue !== undefined)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, entryValue]) => [key, sortJsonValue(entryValue)]),
    );
  }
  return value;
}

export function stableStringify(value: unknown, indentation = 2): string {
  return JSON.stringify(sortJsonValue(value), null, indentation);
}

export function stableStringifyHotelVideoProject(input: unknown, indentation = 2): string {
  return stableStringify(parseHotelVideoProject(input), indentation);
}
