import { callWereadApi } from "./wereadApiGateway";
import type { WereadProvider } from "../wereadProvider";
import type {
  NormalizedWereadNotebook,
  NormalizedWereadBookInfo,
  NormalizedWereadChapter,
  NormalizedWereadHighlight,
  NormalizedWereadReview,
  NormalizedWereadBestHighlight,
} from "./types/normalized";
import type {
  RawNotebooksResponse,
  RawBookInfoResponse,
  RawChapterInfoResponse,
  RawBookmarkListResponse,
  RawReviewListMineResponse,
} from "./types/raw";
import { normalizeNotebooks } from "./normalizers/normalizeNotebooks";
import { normalizeBookInfo } from "./normalizers/normalizeBookInfo";
import { normalizeChapters } from "./normalizers/normalizeChapters";
import { normalizeHighlights } from "./normalizers/normalizeHighlights";
import { normalizeReviews } from "./normalizers/normalizeReviews";

const MAX_PAGES = 100;

export class wereadApiProvider implements WereadProvider {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async getNotebooks(): Promise<NormalizedWereadNotebook[]> {
    const allBooks: RawNotebooksResponse["books"] = [];
    let hasMore = 1;
    let lastSort: number | undefined;
    let page = 0;

    while (hasMore && page < MAX_PAGES) {
      const params: Record<string, unknown> = { count: 100 };
      if (lastSort !== undefined) {
        params.lastSort = lastSort;
      }

      const result = await callWereadApi<RawNotebooksResponse>(
        this.apiKey,
        "/user/notebooks",
        params
      );

      const books = result.books || [];
      if (books.length === 0) break;

      allBooks.push(...books);

      hasMore = result.hasMore ?? 0;

      const nextLastSort = books[books.length - 1]?.sort;
      if (typeof nextLastSort !== "number") break;
      if (nextLastSort === lastSort) break;
      lastSort = nextLastSort;

      page++;
    }

    return normalizeNotebooks({ books: allBooks });
  }

  async getBookInfo(bookId: string): Promise<NormalizedWereadBookInfo> {
    const result = await callWereadApi<RawBookInfoResponse>(
      this.apiKey,
      "/book/info",
      { bookId }
    );
    return normalizeBookInfo(result);
  }

  async getChapters(bookId: string): Promise<NormalizedWereadChapter[]> {
    const result = await callWereadApi<RawChapterInfoResponse>(
      this.apiKey,
      "/book/chapterinfo",
      { bookId }
    );
    return normalizeChapters(result);
  }

  async getHighlights(bookId: string): Promise<NormalizedWereadHighlight[]> {
    const chapterResult = await callWereadApi<RawChapterInfoResponse>(
      this.apiKey,
      "/book/chapterinfo",
      { bookId }
    );
    const bookmarkResult = await callWereadApi<RawBookmarkListResponse>(
      this.apiKey,
      "/book/bookmarklist",
      { bookId }
    );
    return normalizeHighlights(bookmarkResult, chapterResult.chapters);
  }

  async getReviews(bookId: string): Promise<NormalizedWereadReview[]> {
    const allReviews: RawReviewListMineResponse["reviews"] = [];
    let hasMore = 1;
    let synckey = 0;
    let page = 0;

    while (hasMore && page < MAX_PAGES) {
      const result = await callWereadApi<RawReviewListMineResponse>(
        this.apiKey,
        "/review/list/mine",
        { bookid: bookId, count: 100, synckey }
      );

      const reviews = result.reviews || [];
      allReviews.push(...reviews);

      hasMore = result.hasMore ?? 0;

      if (reviews.length === 0 && hasMore) break;

      const nextSynckey = result.synckey;
      if (typeof nextSynckey !== "number") break;
      if (nextSynckey === synckey) break;
      synckey = nextSynckey;

      page++;
    }

    return normalizeReviews({ reviews: allReviews });
  }

  async getBestHighlights(bookId: string): Promise<NormalizedWereadBestHighlight[]> {
    const result = await callWereadApi<any>(
      this.apiKey,
      "/book/bestbookmarks",
      { bookId, chapterUid: 0, synckey: 0 }
    );

    const items = result?.items || result?.bestBookMarks?.items || [];
    const chapters = result?.chapters || [];
    const chapterMap = new Map<number, any>();
    for (const ch of chapters) {
      if (typeof ch?.chapterUid === "number") chapterMap.set(ch.chapterUid, ch);
    }

    return items
      .filter((item: any) => item?.markText)
      .map((item: any) => {
        const chapter = chapterMap.get(Number(item.chapterUid));
        return {
          bookId: item.bookId || bookId,
          bookmarkId: item.bookmarkId || "",
          chapterUid: Number(item.chapterUid || 0),
          chapterIdx: Number(item.chapterIdx ?? chapter?.chapterIdx ?? 0),
          chapterTitle: chapter?.title || "",
          markText: String(item.markText || ""),
          totalCount: Number(item.totalCount || 0),
          range: item.range || "",
          raw: item,
        };
      });
  }
}
