import { callWereadApi } from "./wereadApiGateway";
import type { RawBookInfoResponse } from "./types/raw";

export async function buildWereadApiDatabaseBookDetail(
  apiKey: string,
  bookID: string
): Promise<any> {
  const bookInfo = await callWereadApi<RawBookInfoResponse>(apiKey, "/book/info", { bookId: bookID });

  return {
    bookId: bookInfo.bookId || bookID,
    title: bookInfo.title || "",
    author: bookInfo.author || "",
    translator: bookInfo.translator || "",
    cover: bookInfo.cover || "",
    intro: bookInfo.intro || "",
    category: bookInfo.category || "",
    publisher: bookInfo.publisher || "",
    publishTime: bookInfo.publishTime || "",
    isbn: bookInfo.isbn || "",
    wordCount: bookInfo.wordCount || 0,
    newRating: bookInfo.newRating || 0,
    newRatingCount: bookInfo.newRatingCount || 0,
    newRatingDetail: bookInfo.newRatingDetail || { title: "" },
    ratingCount: bookInfo.newRatingCount || 0,
    rating: bookInfo.newRating || 0,
    authors: bookInfo.author || "",
    translators: bookInfo.translator || "",
    format: bookInfo.format || "",
    centPrice: bookInfo.centPrice || 0,
    pages: bookInfo.pages || 0,
    subtitle: bookInfo.subtitle || "",
    originalTitle: bookInfo.originalTitle || "",
    producer: bookInfo.producer || "",
    series: bookInfo.series || "",
    myRating: "",
    readingStatus: "",
    startDate: "",
    finishDate: "",
    copyrightInfo: bookInfo.copyrightInfo || { name: bookInfo.publisher || "" },
  };
}
