import { isValidISBN, normalizeISBN } from "../../bookHandling/isbn";
import { buildWereadApiDatabaseBookDetail } from "./buildWereadApiDatabaseBookDetail";

export interface WereadNewSourceISBNResult {
  isbn: string;
  title: string;
  author: string;
  cover: string;
  introduction: string;
  publisher: string;
  publishTime: string;
}

export async function resolveWereadNewSourceISBN(
  apiKey: string,
  bookID: string,
): Promise<WereadNewSourceISBNResult> {
  const detail = await buildWereadApiDatabaseBookDetail(apiKey, bookID);
  const isbn = normalizeISBN(detail.isbn);

  return {
    isbn: isValidISBN(isbn) ? isbn : "",
    title: detail.title,
    author: detail.author,
    cover: detail.cover,
    introduction: detail.intro,
    publisher: detail.publisher,
    publishTime: detail.publishTime,
  };
}
