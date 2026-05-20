import { buildWereadApiBookSyncData } from "./buildWereadApiBookSyncData";
import { convertWereadApiBookToTemplateData } from "./convertWereadApiBookToTemplateData";
import type { EnhancedSyncNotebookRecord } from "../types";

export async function buildWereadApiEnhancedNotebook(
  apiKey: string,
  notebook: {
    bookID: string;
    title?: string;
    author?: string;
    isbn?: string;
    updatedTime?: number;
    blockID?: string;
    sourceType?: "weread_book" | "weread_mp_account";
  }
): Promise<EnhancedSyncNotebookRecord> {
  const data = await buildWereadApiBookSyncData(apiKey, notebook.bookID);
  const templateData = convertWereadApiBookToTemplateData(data);

  return {
    bookID: notebook.bookID,
    title: templateData.book.title || notebook.title || notebook.bookID,
    author: templateData.book.author || notebook.author || "",
    isbn: templateData.book.isbn || notebook.isbn || "",
    updatedTime: notebook.updatedTime || Math.floor(Date.now() / 1000),
    blockID: notebook.blockID,
    sourceType: "weread_book",
    highlights: { updated: templateData.bookmarks },
    comments: {
      reviews: templateData.reviews.map((r) => ({
        review: {
          reviewId: r.reviewId,
          bookId: r.bookId,
          chapterUid: r.chapterUid,
          chapterIdx: r.chapterIdx,
          chapterTitle: r.chapterTitle,
          chapterName: r.chapterName,
          content: r.content,
          abstract: r.abstract,
          createTime: r.createTime,
          range: r.range,
          type: r.type,
        },
      })),
    },
    bookDetails: {
      bookId: templateData.book.bookId,
      title: templateData.book.title,
      author: templateData.book.author,
      authors: templateData.book.author,
      cover: templateData.book.cover,
      format: "",
      price: 0,
      intro: templateData.book.intro,
      publishTime: templateData.book.publishTime || "",
      category: templateData.book.category || "",
      isbn: templateData.book.isbn || "",
      publisher: templateData.book.publisher || "",
      totalWords: 0,
      newRating: templateData.book.newRating || 0,
      ratingCount: templateData.book.newRatingCount || 0,
    },
    bestHighlights: {
      bestBookMarks: {
        items: data.bestHighlights || [],
      },
    },
    chapterInfos: {
      bookId: notebook.bookID,
      updated: templateData.chapters.map((ch) => ({
        chapterUid: ch.chapterUid,
        chapterIdx: ch.chapterIdx ?? 0,
        title: ch.title,
        level: ch.level ?? 0,
      })),
    },
  };
}
