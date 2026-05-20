import { wereadApiProvider } from "./wereadApiProvider";
import type { NormalizedWereadNotebook } from "./types/normalized";

export async function buildWereadApiNotebookCache(apiKey: string): Promise<any[]> {
  const provider = new wereadApiProvider(apiKey);
  const notebooks = await provider.getNotebooks();

  return notebooks.map((notebook: NormalizedWereadNotebook) => {
    const noteCount = notebook.noteCount ?? 0;
    const reviewCount = notebook.reviewCount ?? 0;
    const bookmarkCount = notebook.bookmarkCount ?? 0;
    const totalNoteCount = notebook.totalNoteCount ?? (noteCount + reviewCount + bookmarkCount);

    return {
      sourceType: notebook.sourceType === "mp" ? "weread_mp_account" : "weread_book",
      noteCount,
      reviewCount,
      bookmarkCount,
      totalNoteCount,
      updatedTime: notebook.sort ?? 0,
      bookID: notebook.bookId,
      title: notebook.title,
      author: notebook.author ?? "",
      cover: notebook.cover ?? "",
      format: "",
      price: 0,
      introduction: "",
      publishTime: notebook.publishTime ?? "",
      category: notebook.category ?? "",
      isbn: notebook.isbn ?? "",
      publisher: notebook.publisher ?? "",
      totalWords: 0,
      star: 0,
      ratingCount: 0,
    };
  });
}
