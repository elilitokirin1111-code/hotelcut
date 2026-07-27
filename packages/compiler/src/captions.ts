const openingPunctuation = new Set(['“', '‘', '（', '【', '《']);
const closingPunctuation = new Set([
  '，',
  '。',
  '！',
  '？',
  '；',
  '：',
  '、',
  '”',
  '’',
  '）',
  '】',
  '》',
  ',',
  '.',
  '!',
  '?',
  ';',
  ':',
]);

function visualWidth(character: string): number {
  return (character.codePointAt(0) ?? 0) <= 0xff ? 1 : 2;
}

export function splitCaptionLines(text: string, maxVisualWidth: number): string[] {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length === 0) {
    return [];
  }

  const lines: string[] = [];
  let current = '';
  let width = 0;

  for (const character of normalized) {
    const characterWidth = visualWidth(character);
    const wouldOverflow = width + characterWidth > maxVisualWidth;
    if (wouldOverflow && current.length > 0 && !closingPunctuation.has(character)) {
      lines.push(current.trim());
      current = '';
      width = 0;
    }
    if (current.length === 0 && openingPunctuation.has(character) && lines.length > 0) {
      const previous = lines.pop();
      current = `${previous ?? ''}${character}`;
      width = [...current].reduce((total, value) => total + visualWidth(value), 0);
      continue;
    }
    current += character;
    width += characterWidth;
    if (closingPunctuation.has(character) && width >= Math.floor(maxVisualWidth * 0.65)) {
      lines.push(current.trim());
      current = '';
      width = 0;
    }
  }

  if (current.trim().length > 0) {
    lines.push(current.trim());
  }
  return lines;
}

export function paginateCaptionLines(lines: readonly string[], maxLines: number): string[] {
  const pages: string[] = [];
  for (let index = 0; index < lines.length; index += maxLines) {
    pages.push(lines.slice(index, index + maxLines).join('\n'));
  }
  return pages;
}
