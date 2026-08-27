import { wereadApiProvider } from "./wereadApiProvider";
import { isWereadRateLimitError } from "./wereadApiGateway";
import type { WereadApiBookSyncData } from "./types/normalized";

async function safeGetBestHighlights(provider: wereadApiProvider, bookId: string) {
  try {
    return await provider.getBestHighlights(bookId);
  } catch (error) {
    if (isWereadRateLimitError(error)) throw error;
    return [];
  }
}

export async function buildWereadApiBookSyncData(apiKey: string, bookId: string): Promise<WereadApiBookSyncData> {
  const provider = new wereadApiProvider(apiKey);

  const [bookInfo, chapters, reviews, bestHighlights] = await Promise.all([
    provider.getBookInfo(bookId),
    provider.getChapters(bookId),
    provider.getReviews(bookId),
    safeGetBestHighlights(provider, bookId),
  ]);
  const highlights = await provider.getHighlights(bookId, chapters);

  const chapterMap = new Map<number, typeof chapters[number]>();
  for (const ch of chapters) {
    chapterMap.set(ch.chapterUid, ch);
  }

  return {
    bookInfo,
    chapters,
    highlights,
    reviews,
    bestHighlights,
    chapterMap,
  };
}
