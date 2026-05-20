import type {
  WereadApiBookSyncData,
  WereadTemplateBookSyncData,
  WereadTemplateBook,
  WereadTemplateChapter,
  WereadTemplateBookmark,
  WereadTemplateReview,
} from "./types/normalized";

export function convertWereadApiBookToTemplateData(data: WereadApiBookSyncData): WereadTemplateBookSyncData {
  const book: WereadTemplateBook = {
    bookId: data.bookInfo.bookId,
    title: data.bookInfo.title,
    author: data.bookInfo.author,
    cover: data.bookInfo.cover,
    intro: data.bookInfo.intro,
    category: data.bookInfo.category,
    publisher: data.bookInfo.publisher,
    publishTime: data.bookInfo.publishTime,
    isbn: data.bookInfo.isbn,
    newRating: data.bookInfo.newRating,
    newRatingCount: data.bookInfo.newRatingCount,
  };

  const chapters: WereadTemplateChapter[] = data.chapters.map((ch) => ({
    chapterUid: ch.chapterUid,
    chapterIdx: ch.chapterIdx,
    title: ch.title,
    level: ch.level,
  }));

  const bookmarks: WereadTemplateBookmark[] = data.highlights.map((hl) => ({
    bookmarkId: hl.id,
    bookId: hl.bookId,
    chapterUid: hl.chapterUid,
    chapterIdx: hl.chapterIdx,
    chapterTitle: hl.chapterTitle,
    markText: hl.markText,
    createTime: hl.createTime,
    range: hl.range,
    colorStyle: hl.colorStyle,
    type: hl.type,
  }));

  const reviews: WereadTemplateReview[] = data.reviews.map((rv) => ({
    reviewId: rv.id,
    bookId: rv.bookId,
    chapterUid: rv.chapterUid,
    chapterIdx: rv.chapterIdx,
    chapterTitle: rv.chapterTitle,
    chapterName: rv.chapterName,
    content: rv.content,
    abstract: rv.abstract,
    createTime: rv.createTime,
    range: rv.range,
    type: rv.type,
  }));

  return { book, chapters, bookmarks, reviews };
}
