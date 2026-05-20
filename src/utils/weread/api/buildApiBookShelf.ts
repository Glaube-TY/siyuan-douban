import { callWereadApi } from "./wereadApiGateway";
import type { RawNotebooksResponse, RawBookInfoResponse } from "./types/raw";

export async function buildApiBookShelf(
  apiKey: string,
  notebooksList: any[]
): Promise<any[]> {
  const shelfResponse = await callWereadApi<RawNotebooksResponse>(apiKey, "/shelf/sync", {});
  const books = shelfResponse?.books || [];

  const notebooksMap = new Map<string, any>();
  for (const nb of notebooksList) {
    const id = nb?.bookID || nb?.bookId;
    if (id) notebooksMap.set(id, nb);
  }

  const result: any[] = [];

  for (const book of books) {
    const bookId = book?.bookId || book?.book?.bookId;
    if (!bookId) continue;

    const isMpAccount = bookId.startsWith("MP_WXS_");

    let title = book?.book?.title || book?.title || "";
    let author = book?.book?.author || book?.author || "";
    let cover = book?.book?.cover || book?.cover || "";
    let isbn = book?.book?.isbn || book?.isbn || "";
    let publisher = book?.book?.publisher || book?.publisher || "";
    let publishTime = book?.book?.publishTime || book?.publishTime || "";
    let category = book?.book?.category || book?.category || "";
    let intro = book?.book?.intro || book?.intro || "";
    let format = book?.book?.format || book?.format || "";
    let price = book?.book?.price ?? book?.price ?? 0;
    let totalWords = book?.book?.totalWords ?? book?.totalWords ?? 0;
    let star = book?.book?.newRating ?? book?.newRating ?? 0;
    let ratingCount = book?.book?.newRatingCount ?? book?.newRatingCount ?? 0;
    let categories = book?.book?.categories || book?.categories || [];

    const nb = notebooksMap.get(bookId);
    const noteCount = nb?.noteCount ?? 0;
    const reviewCount = nb?.reviewCount ?? 0;

    if (!isMpAccount && !isbn) {
      try {
        const bookInfo = await callWereadApi<RawBookInfoResponse>(apiKey, "/book/info", { bookId });
        if (bookInfo) {
          isbn = bookInfo.isbn || isbn;
          author = bookInfo.author || author;
          cover = bookInfo.cover || cover;
          publisher = bookInfo.publisher || publisher;
          publishTime = bookInfo.publishTime || publishTime;
          category = bookInfo.category || category;
          intro = bookInfo.intro || intro;
        }
      } catch {
        // 单本失败不影响其他
      }
    }

    result.push({
      bookID: bookId,
      title,
      author,
      cover,
      format,
      price,
      introduction: intro,
      publishTime,
      category,
      isbn,
      publisher,
      totalWords,
      star,
      ratingCount,
      noteCount,
      reviewCount,
      categories,
      sourceType: isMpAccount ? "weread_mp_account" : "weread_book",
    });
  }

  return result;
}
