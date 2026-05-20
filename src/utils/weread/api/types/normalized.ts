export interface NormalizedWereadNotebook {
  bookId: string;
  title: string;
  author: string;
  cover: string;
  category?: string;
  isbn?: string;
  publisher?: string;
  publishTime?: string;
  noteCount: number;
  reviewCount: number;
  bookmarkCount: number;
  totalNoteCount: number;
  readingProgress?: number;
  markedStatus?: number;
  sort?: number;
  sourceType: "book" | "mp" | "unknown";
  raw: unknown;
}

export interface NormalizedWereadBookInfo {
  bookId: string;
  title: string;
  author: string;
  cover: string;
  intro: string;
  category?: string;
  publisher?: string;
  publishTime?: string;
  isbn?: string;
  newRating?: number;
  newRatingCount?: number;
  newRatingDetail?: unknown;
  raw: unknown;
}

export interface NormalizedWereadChapter {
  chapterUid: number;
  chapterIdx?: number;
  title: string;
  level?: number;
  wordCount?: number;
  updateTime?: number;
  price?: number;
  paid?: number;
  isMPChapter?: number;
  raw: unknown;
}

export interface NormalizedWereadHighlight {
  id: string;
  bookId: string;
  chapterUid?: number;
  chapterIdx?: number;
  chapterTitle?: string;
  markText: string;
  createTime?: number;
  range?: string;
  colorStyle?: number;
  type?: number;
  raw: unknown;
}

export interface NormalizedWereadReview {
  id: string;
  bookId: string;
  chapterUid?: number;
  chapterIdx?: number;
  chapterTitle?: string;
  chapterName?: string;
  content: string;
  abstract?: string;
  createTime?: number;
  range?: string;
  type?: number;
  raw: unknown;
}

export interface NormalizedWereadBestHighlight {
  bookId: string;
  bookmarkId?: string;
  chapterUid?: number;
  chapterIdx?: number;
  chapterTitle?: string;
  markText: string;
  totalCount?: number;
  range?: string;
  raw: unknown;
}

export interface WereadApiBookSyncData {
  bookInfo: NormalizedWereadBookInfo;
  chapters: NormalizedWereadChapter[];
  highlights: NormalizedWereadHighlight[];
  reviews: NormalizedWereadReview[];
  bestHighlights: NormalizedWereadBestHighlight[];
  chapterMap: Map<number, NormalizedWereadChapter>;
}

export interface WereadTemplateBook {
  bookId: string;
  title: string;
  author: string;
  cover: string;
  intro: string;
  category?: string;
  publisher?: string;
  publishTime?: string;
  isbn?: string;
  newRating?: number;
  newRatingCount?: number;
}

export interface WereadTemplateChapter {
  chapterUid: number;
  chapterIdx?: number;
  title: string;
  level?: number;
}

export interface WereadTemplateBookmark {
  bookmarkId: string;
  bookId: string;
  chapterUid?: number;
  chapterIdx?: number;
  chapterTitle?: string;
  markText: string;
  createTime?: number;
  range?: string;
  colorStyle?: number;
  type?: number;
}

export interface WereadTemplateReview {
  reviewId: string;
  bookId: string;
  chapterUid?: number;
  chapterIdx?: number;
  chapterTitle?: string;
  chapterName?: string;
  content: string;
  abstract?: string;
  createTime?: number;
  range?: string;
  type?: number;
}

export interface WereadTemplateBookSyncData {
  book: WereadTemplateBook;
  chapters: WereadTemplateChapter[];
  bookmarks: WereadTemplateBookmark[];
  reviews: WereadTemplateReview[];
}
