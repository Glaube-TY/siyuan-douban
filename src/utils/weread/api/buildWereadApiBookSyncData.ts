import { wereadApiProvider } from "./wereadApiProvider";
import type { WereadApiBookSyncData } from "./types/normalized";

async function safeGetBestHighlights(provider: wereadApiProvider, bookId: string) {
  try {
    return await provider.getBestHighlights(bookId);
  } catch {
    return [];
  }
}

export async function buildWereadApiBookSyncData(apiKey: string, bookId: string): Promise<WereadApiBookSyncData> {
  const provider = new wereadApiProvider(apiKey);

  const [bookInfo, chapters, highlights, reviews, bestHighlights] = await Promise.all([
    provider.getBookInfo(bookId),
    provider.getChapters(bookId),
    provider.getHighlights(bookId),
    provider.getReviews(bookId),
    safeGetBestHighlights(provider, bookId),
  ]);

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
