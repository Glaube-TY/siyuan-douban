import type { RawBookmarkListResponse, RawBookmarkItem, RawChapterItem } from "../types/raw";
import type { NormalizedWereadHighlight } from "../types/normalized";

export function normalizeHighlights(
  raw: RawBookmarkListResponse,
  chapters?: RawChapterItem[]
): NormalizedWereadHighlight[] {
  const chapterTitleMap = new Map<number, string>();
  if (Array.isArray(chapters)) {
    for (const ch of chapters) {
      if (typeof ch.chapterUid === "number" && ch.title) {
        chapterTitleMap.set(ch.chapterUid, ch.title);
      }
    }
  }

  const updated = raw.updated || [];
  return updated
    .filter((item): item is RawBookmarkItem => !!item.markText)
    .map((item) => {
      const id = item.bookmarkId || `${item.bookId}_${item.chapterUid}_${item.range}`;

      return {
        id,
        bookId: item.bookId || "",
        chapterUid: item.chapterUid,
        chapterIdx: item.chapterIdx,
        chapterTitle: item.chapterUid !== undefined ? chapterTitleMap.get(item.chapterUid) : undefined,
        markText: item.markText,
        createTime: item.createTime,
        range: item.range,
        colorStyle: item.colorStyle,
        type: item.type,
        raw: item,
      };
    });
}
