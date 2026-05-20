import type {
  NormalizedWereadNotebook,
  NormalizedWereadBookInfo,
  NormalizedWereadChapter,
  NormalizedWereadHighlight,
  NormalizedWereadReview,
} from "./api/types/normalized";

export interface WereadProvider {
  getNotebooks(): Promise<NormalizedWereadNotebook[]>;
  getBookInfo(bookId: string): Promise<NormalizedWereadBookInfo>;
  getChapters(bookId: string): Promise<NormalizedWereadChapter[]>;
  getHighlights(bookId: string): Promise<NormalizedWereadHighlight[]>;
  getReviews(bookId: string): Promise<NormalizedWereadReview[]>;
}
