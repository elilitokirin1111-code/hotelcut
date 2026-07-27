import type { ZodError } from 'zod';

import {
  TEMPLATE_OUTPUT_SCHEMA_VERSION,
  templateInputSchema,
  templateOutputSchema,
  type TemplateInput,
  type TemplateOutput,
  type TemplateOutputInput,
} from './schema.js';
import {
  createDeterministicTemplateContext,
  type DeterministicTemplateContext,
} from './determinism.js';

export type TemplateGenerator = (
  input: TemplateInput,
  context: DeterministicTemplateContext,
) => Omit<TemplateOutputInput, 'schemaVersion'> | TemplateOutputInput;

export interface TemplateDefinition {
  readonly id: string;
  readonly version: string;
  readonly generate: TemplateGenerator;
}

export interface DefineTemplateOptions {
  id: string;
  version: string;
  generate: TemplateGenerator;
}

export class TemplateExecutionError extends Error {
  readonly code = 'TEMPLATE_EXECUTION_FAILED';
  readonly stage: 'input' | 'generation' | 'output';

  constructor(stage: TemplateExecutionError['stage'], message: string, cause?: unknown) {
    super(`Template ${stage} failed: ${message}`, cause === undefined ? undefined : { cause });
    this.name = 'TemplateExecutionError';
    this.stage = stage;
  }
}

function formatZodError(error: ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.length > 0 ? issue.path.join('.') : '$'}: ${issue.message}`)
    .join('; ');
}

export function defineTemplate(options: DefineTemplateOptions): TemplateDefinition {
  if (!/^[A-Za-z][A-Za-z0-9._:-]*$/.test(options.id)) {
    throw new TypeError('Template id must be a stable alphanumeric key');
  }
  if (!/^\d+\.\d+\.\d+$/.test(options.version)) {
    throw new TypeError('Template version must use semantic versioning');
  }
  return Object.freeze({ ...options });
}

export function executeTemplate(definition: TemplateDefinition, rawInput: unknown): TemplateOutput {
  const inputResult = templateInputSchema.safeParse(rawInput);
  if (!inputResult.success) {
    throw new TemplateExecutionError('input', formatZodError(inputResult.error), inputResult.error);
  }
  const input = inputResult.data;
  if (input.template.id !== definition.id || input.template.version !== definition.version) {
    throw new TemplateExecutionError(
      'input',
      `Input requests ${input.template.id}@${input.template.version}, but executor loaded ${definition.id}@${definition.version}`,
    );
  }

  const context = createDeterministicTemplateContext(
    definition.id,
    definition.version,
    input.seed,
    input,
  );

  let generated: ReturnType<TemplateGenerator>;
  try {
    generated = definition.generate(input, context);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new TemplateExecutionError('generation', message, error);
  }

  const outputResult = templateOutputSchema.safeParse({
    ...generated,
    schemaVersion: TEMPLATE_OUTPUT_SCHEMA_VERSION,
  });
  if (!outputResult.success) {
    throw new TemplateExecutionError(
      'output',
      formatZodError(outputResult.error),
      outputResult.error,
    );
  }

  const output = outputResult.data;
  if (output.project.id !== input.projectId || output.project.hotelId !== input.hotelId) {
    throw new TemplateExecutionError(
      'output',
      'Generated project identity does not match the template input',
    );
  }
  if (
    output.project.template.id !== definition.id ||
    output.project.template.version !== definition.version
  ) {
    throw new TemplateExecutionError(
      'output',
      'Generated project template reference does not match the loaded template',
    );
  }
  if (output.project.generation.seed !== input.seed) {
    throw new TemplateExecutionError(
      'output',
      'Generated project seed does not match the template input',
    );
  }
  return output;
}
