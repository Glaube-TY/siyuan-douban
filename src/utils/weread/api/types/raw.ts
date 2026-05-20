export interface RawNotebookBook {
  bookId: string;
  title?: string;
  author?: string;
  cover?: string;
  type?: number;
  categories?: Array<{
    categoryId?: number;
    subCategoryId?: number;
    categoryType?: number;
    title?: string;
  }>;
  publishTime?: string;
  isbn?: string;
  publisher?: string;
  [key: string]: unknown;
}

export interface RawNotebookItem {
  bookId: string;
  book?: RawNotebookBook;
  reviewCount?: number;
  noteCount?: number;
  bookmarkCount?: number;
  markedStatus?: number;
  readingProgress?: number;
  sort?: number;
  [key: string]: unknown;
}

export interface RawNotebooksResponse {
  synckey?: number;
  totalBookCount?: number;
  noBookReviewCount?: number;
  hasMore?: number;
  totalNoteCount?: number;
  books?: RawNotebookItem[];
  [key: string]: unknown;
}

export interface RawBookInfoResponse {
  bookId: string;
  title?: string;
  author?: string;
  cover?: string;
  publisher?: string;
  intro?: string;
  category?: string;
  isbn?: string;
  publishTime?: string;
  newRating?: number;
  newRatingCount?: number;
  newRatingDetail?: {
    good?: number;
    fair?: number;
    poor?: number;
    recent?: number;
    deepV?: number;
    myRating?: string;
    title?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface RawChapterItem {
  chapterUid: number;
  chapterIdx?: number;
  updateTime?: number;
  level?: number;
  title?: string;
  wordCount?: number;
  price?: number;
  isMPChapter?: number;
  paid?: number;
  [key: string]: unknown;
}

export interface RawChapterInfoResponse {
  bookId: string;
  synckey?: number;
  chapterUpdateTime?: number;
  chapters?: RawChapterItem[];
  [key: string]: unknown;
}

export interface RawBookmarkItem {
  bookId: string;
  chapterIdx?: number;
  bookmarkId?: string;
  chapterUid?: number;
  colorStyle?: number;
  createTime?: number;
  markText?: string;
  range?: string;
  type?: number;
  [key: string]: unknown;
}

export interface RawBookmarkListResponse {
  synckey?: number;
  updated?: RawBookmarkItem[];
  removed?: unknown[];
  [key: string]: unknown;
}

export interface RawReviewInner {
  abstract?: string;
  atUserVids?: unknown[];
  bookId?: string;
  bookVersion?: number;
  chapterName?: string;
  chapterUid?: number;
  content?: string;
  contextAbstract?: string;
  friendship?: number;
  htmlContent?: string;
  isPrivate?: number;
  notVisibleToFriends?: number;
  onlyVisibleOneBook?: number;
  range?: string;
  createTime?: number;
  title?: string;
  type?: number;
  chapterIdx?: number;
  reviewId?: string;
  userVid?: number;
  topics?: unknown[];
  flag?: number;
  isLike?: number;
  isReposted?: number;
  chapterTitle?: string;
  author?: {
    userVid?: number;
    name?: string;
    avatar?: string;
    nick?: string;
    isDeepV?: boolean;
    deepVTitle?: string;
    [key: string]: unknown;
  };
  book?: {
    bookId?: string;
    title?: string;
    author?: string;
    cover?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface RawReviewItem {
  reviewId?: string;
  review?: RawReviewInner;
  likesCount?: number;
  [key: string]: unknown;
}

export interface RawReviewListMineResponse {
  synckey?: number;
  totalCount?: number;
  hasMore?: number;
  reviews?: RawReviewItem[];
  [key: string]: unknown;
}
