import type { RawChapterInfoResponse } from "../types/raw";
import type { NormalizedWereadChapter } from "../types/normalized";

export function normalizeChapters(raw: RawChapterInfoResponse): NormalizedWereadChapter[] {
  const chapters = raw.chapters || [];
  return chapters.map((item) => ({
    chapterUid: item.chapterUid,
    chapterIdx: item.chapterIdx,
    title: item.title || "",
    level: item.level,
    wordCount: item.wordCount,
    updateTime: item.updateTime,
    price: item.price,
    paid: item.paid,
    isMPChapter: item.isMPChapter,
    raw: item,
  }));
}
