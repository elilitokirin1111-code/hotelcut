import type { CompilationTemplate } from '@hotelcut/compiler';

import { hostBrollTemplate } from './host-broll.js';
import { promotionTemplate } from './promotion.js';
import { roomMontageTemplate } from './room-montage.js';

export { hostBrollTemplate } from './host-broll.js';
export { promotionTemplate } from './promotion.js';
export { roomMontageTemplate } from './room-montage.js';

export const compilationTemplates = [
  hostBrollTemplate,
  roomMontageTemplate,
  promotionTemplate,
] as const satisfies readonly CompilationTemplate[];

export function getCompilationTemplate(templateId: string): CompilationTemplate {
  const template = compilationTemplates.find((candidate) => candidate.id === templateId);
  if (!template) {
    throw new Error(`Unknown HotelCut template: ${templateId}`);
  }
  return template;
}
