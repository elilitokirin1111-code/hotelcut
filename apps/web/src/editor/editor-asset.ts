export type PreviewArtworkKind = 'host' | 'lake' | 'room' | 'breakfast' | 'lobby' | 'suite' | 'spa';

export interface EditorAsset {
  id: string;
  kind: 'video' | 'image' | 'audio';
  name: string;
  detail: string;
  durationFrames: number;
  artwork: PreviewArtworkKind;
  colors: readonly [string, string];
}

export function findEditorAsset(
  assetId: string,
  assets: readonly EditorAsset[],
): EditorAsset | undefined {
  return assets.find((asset) => asset.id === assetId);
}
