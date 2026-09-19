import { callWereadApi } from "./wereadApiGateway";
import type { RawBookInfoResponse } from "./types/raw";

export interface WereadApiDatabaseBookDetail {
  bookId: string;
  title: string;
  author: string;
  cover: string;
  intro: string;
  publisher: string;
  publishTime: string;
  isbn: string;
  newRating: number;
  newRatingCount: number;
  newRatingDetail: NonNullable<RawBookInfoResponse["newRatingDetail"]>;
}

export async function buildWereadApiDatabaseBookDetail(
  apiKey: string,
  bookID: string
): Promise<WereadApiDatabaseBookDetail> {
  const bookInfo = await callWereadApi<RawBookInfoResponse>(apiKey, "/book/info", { bookId: bookID });

  return {
    bookId: bookInfo.bookId || bookID,
    title: bookInfo.title || "",
    author: bookInfo.author || "",
    cover: bookInfo.cover || "",
    intro: bookInfo.intro || "",
    publisher: bookInfo.publisher || "",
    publishTime: bookInfo.publishTime || "",
    isbn: bookInfo.isbn || "",
    newRating: bookInfo.newRating || 0,
    newRatingCount: bookInfo.newRatingCount || 0,
    newRatingDetail: bookInfo.newRatingDetail || { title: "" },
  };
}
