import type { RawNotebooksResponse, RawNotebookItem } from "../types/raw";
import type { NormalizedWereadNotebook } from "../types/normalized";

function toNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function resolveSourceType(item: RawNotebookItem): "book" | "mp" | "unknown" {
  const bookId = item.bookId || "";
  const bookType = item.book?.type;
  const author = item.book?.author;

  if (bookId.startsWith("MP_")) return "mp";
  if (bookType === 3) return "mp";
  if (author === "公众号") return "mp";

  if (/^\d+$/.test(bookId)) return "book";

  return "unknown";
}

function resolveCategory(item: RawNotebookItem): string | undefined {
  const cats = item.book?.categories;
  if (Array.isArray(cats) && cats.length > 0) {
    return cats[0].title;
  }
  return undefined;
}

export function normalizeNotebooks(raw: RawNotebooksResponse): NormalizedWereadNotebook[] {
  const books = raw.books || [];
  return books.map((item) => {
    const book = item.book || ({} as NonNullable<RawNotebookItem["book"]>);
    const noteCount = toNum(item.noteCount);
    const reviewCount = toNum(item.reviewCount);
    const bookmarkCount = toNum(item.bookmarkCount);

    return {
      bookId: item.bookId || "",
      title: book.title || "",
      author: book.author || "",
      cover: book.cover || "",
      category: resolveCategory(item),
      isbn: book.isbn,
      publisher: book.publisher,
      publishTime: book.publishTime,
      noteCount,
      reviewCount,
      bookmarkCount,
      totalNoteCount: noteCount + reviewCount + bookmarkCount,
      readingProgress: item.readingProgress,
      markedStatus: item.markedStatus,
      sort: item.sort,
      sourceType: resolveSourceType(item),
      raw: item,
    };
  });
}
