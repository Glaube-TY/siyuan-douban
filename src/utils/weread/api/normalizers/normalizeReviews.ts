import type { RawReviewListMineResponse } from "../types/raw";
import type { NormalizedWereadReview } from "../types/normalized";

export function normalizeReviews(raw: RawReviewListMineResponse): NormalizedWereadReview[] {
  const items = raw.reviews || [];
  return items.map((item) => {
    const review = item.review || {};
    const bookId = review.bookId || "";
    const id = item.reviewId || review.reviewId || `${bookId}_${review.chapterUid}`;

    return {
      id,
      bookId,
      chapterUid: review.chapterUid,
      chapterIdx: review.chapterIdx,
      chapterTitle: review.chapterTitle,
      chapterName: review.chapterName,
      content: review.content || "",
      abstract: review.abstract,
      createTime: review.createTime,
      range: review.range,
      type: review.type,
      raw: item,
    };
  });
}
