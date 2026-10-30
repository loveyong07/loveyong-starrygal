import { mediaUrl, normalizeTags } from "./model.ts";

export interface GameMetadata {
  title?: string;
  originalTitle?: string | null;
  coverUrl?: string | null;
  description?: string | null;
  developer?: string | null;
  releaseDate?: string | null;
  tags?: string[];
  videoUrl?: string | null;
  screenshots?: string[];
  touchgalId?: string | null;
  touchgalUrl?: string | null;
  sourceTitle?: string | null;
  communityRating?: number | null;
  communityRatingCount?: number;
}

/** A metadata lookup never modifies the user's library itself. */
export interface GameMetadataProvider {
  searchByName(name: string, signal: AbortSignal): Promise<GameMetadata | null>;
}

let provider: GameMetadataProvider | null = null;

export function registerMetadataProvider(adapter: GameMetadataProvider | null) {
  provider = adapter;
}

export function metadataConfigured() {
  return provider !== null;
}

export async function lookupGameByName(name: string, signal: AbortSignal) {
  if (!provider || !name.trim() || signal.aborted) return null;
  const result = await provider.searchByName(name.trim(), signal);
  if (!result || signal.aborted) return null;
  return {
    ...result,
    coverUrl: mediaUrl(result.coverUrl),
    videoUrl: mediaUrl(result.videoUrl),
    tags: normalizeTags(result.tags),
  };
}
