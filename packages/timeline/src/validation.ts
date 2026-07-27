import type { ZodError } from 'zod';

import { hotelVideoProjectV1Schema, type HotelVideoProjectV1 } from './schema.js';

export interface TimelineValidationIssue {
  path: string;
  message: string;
}

function formatPath(path: readonly PropertyKey[]): string {
  if (path.length === 0) {
    return '$';
  }
  return path.reduce<string>((result, part) => {
    if (typeof part === 'number') {
      return `${result}[${part}]`;
    }
    const key = String(part);
    return result.length === 0 ? key : `${result}.${key}`;
  }, '');
}

export function formatTimelineValidationIssues(error: ZodError): TimelineValidationIssue[] {
  return error.issues.map((issue) => ({
    path: formatPath(issue.path),
    message: issue.message,
  }));
}

export class TimelineValidationError extends Error {
  readonly code = 'INVALID_TIMELINE';
  readonly issues: readonly TimelineValidationIssue[];

  constructor(error: ZodError) {
    const issues = formatTimelineValidationIssues(error);
    super(
      `Invalid HotelVideoProject:\n${issues.map((issue) => `- ${issue.path}: ${issue.message}`).join('\n')}`,
    );
    this.name = 'TimelineValidationError';
    this.issues = issues;
  }
}

export function parseHotelVideoProject(input: unknown): HotelVideoProjectV1 {
  const result = hotelVideoProjectV1Schema.safeParse(input);
  if (!result.success) {
    throw new TimelineValidationError(result.error);
  }
  return result.data;
}
