import type { RawBookInfoResponse } from "../types/raw";
import type { NormalizedWereadBookInfo } from "../types/normalized";

export function normalizeBookInfo(raw: RawBookInfoResponse): NormalizedWereadBookInfo {
  return {
    bookId: raw.bookId || "",
    title: raw.title || "",
    author: raw.author || "",
    cover: raw.cover || "",
    intro: raw.intro || "",
    category: raw.category,
    publisher: raw.publisher,
    publishTime: raw.publishTime,
    isbn: raw.isbn,
    newRating: raw.newRating,
    newRatingCount: raw.newRatingCount,
    newRatingDetail: raw.newRatingDetail,
    raw,
  };
}
