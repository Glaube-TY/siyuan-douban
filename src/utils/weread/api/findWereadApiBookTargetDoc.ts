import { sql, getAttributeView, removeAttributeViewBlocks } from "@/api";
import {
  getAttributeViewNoteDocumentCandidate,
  getNoteDocumentBinding,
  validateNoteDocumentBindings,
} from "../../readingManagement/noteDocumentBinding";

interface WereadPluginLike {
  loadData: (key: string) => Promise<any>;
  i18n: Record<string, string>;
}

async function validateTargetDocBlock(blockID: string): Promise<{ valid: boolean; reason?: string; block?: any }> {
  if (!blockID || typeof blockID !== "string" || blockID.trim().length === 0) {
    return { valid: false, reason: "blockID 为空或格式异常" };
  }

  const blockResult = await sql(`SELECT * FROM blocks WHERE id = "${blockID}"`);
  if (!blockResult || blockResult.length === 0) {
    return {
      valid: false,
      reason: "数据库行存在，但未找到对应读书笔记文档块，请先生成或绑定读书笔记文档",
    };
  }

  const block = blockResult[0];
  if (block.type !== "d") {
    return {
      valid: false,
      reason: "匹配到的 blockID 不是文档块（type=" + block.type + "），禁止写入",
    };
  }

  return { valid: true, block };
}

function getValueText(v: any): string {
  return String(
    v?.text?.content ??
    v?.block?.content ??
    v?.number?.formattedContent ??
    v?.number?.content ??
    ""
  ).trim();
}

function normalizeISBN(value: any): string {
  return String(value ?? "")
    .replace(/[\s\-\u2014\u2013_]/g, "")
    .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .trim();
}

function getValueBlockID(v: any): string {
  return String(v?.blockID || "").trim();
}

function getValueRowID(v: any): string {
  return String(v?.blockID || v?.itemID || "").trim();
}

function getValueDocID(v: any): string {
  return String(
    v?.block?.id ??
    v?.blockID ??
    v?.itemID ??
    ""
  ).trim();
}

function resolveDocIDFromMatchedValue(matchedValue: any, titleValues: any[]): string {
  const rowID = getValueRowID(matchedValue);
  const titleByRow = titleValues.find(t =>
    getValueRowID(t) === rowID ||
    getValueDocID(t) === rowID ||
    getValueDocID(t) === getValueDocID(matchedValue)
  );
  return getValueDocID(titleByRow) || getValueDocID(matchedValue) || rowID;
}

interface BookRow {
  rowBlockID: string;
  docBlockID: string;
  title: string;
  titleValue: any;
  isbn: string;
  bookID: string;
}

function buildRowsByTitle(
  titleValues: any[],
  isbnValues: any[],
  bookIDValues: any[],
  strictDocumentCandidate = false,
): Map<string, BookRow> {
  const rows = new Map<string, BookRow>();

  for (const tv of titleValues) {
    const rowBlockID = getValueBlockID(tv);
    const docBlockID = strictDocumentCandidate
      ? getAttributeViewNoteDocumentCandidate(tv)
      : getValueDocID(tv);
    if (!rowBlockID) continue;
    rows.set(rowBlockID, {
      rowBlockID,
      docBlockID,
      title: getValueText(tv),
      titleValue: tv,
      isbn: "",
      bookID: "",
    });
  }

  for (const iv of isbnValues) {
    const rowBlockID = getValueBlockID(iv);
    if (!rowBlockID || !rows.has(rowBlockID)) continue;
    const row = rows.get(rowBlockID)!;
    row.isbn = normalizeISBN(getValueText(iv)).toUpperCase();
  }

  for (const bv of bookIDValues) {
    const rowBlockID = getValueBlockID(bv);
    if (!rowBlockID || !rows.has(rowBlockID)) continue;
    const row = rows.get(rowBlockID)!;
    row.bookID = getValueText(bv);
  }

  return rows;
}

async function loadDatabaseView(plugin: WereadPluginLike): Promise<{ avID: string; titleValues: any[]; isbnValues: any[]; bookIDValues: any[] }> {
  const settings = await plugin.loadData("settings.json");
  const databaseBlockId = settings?.bookDatabaseID || "";
  if (!databaseBlockId) {
    throw new Error("未设置书籍数据库");
  }

  const blockResult = await sql(
    `SELECT * FROM blocks WHERE id = "${databaseBlockId}"`
  );
  const avID = blockResult[0]?.markdown?.match(/data-av-id="([^"]+)"/)?.[1] || "";
  if (!avID) {
    throw new Error("未找到数据库视图 ID");
  }

  let db = await getAttributeView(avID);
  let keyValues = db?.av?.keyValues || [];

  let bookIDKey = keyValues.find((kv: any) => kv.key?.name === "bookID");
  let isbnKey = keyValues.find((kv: any) => kv.key?.name === "ISBN");
  let titleKey = keyValues.find((kv: any) => kv.key?.name === "书名");

  let bookIDValues = bookIDKey?.values || [];
  let isbnValues = isbnKey?.values || [];
  let titleValues = titleKey?.values || [];

  return { avID, titleValues, isbnValues, bookIDValues };
}

async function cleanOrphansAndReload(avID: string, titleValues: any[], isbnValues: any[], bookIDValues: any[]): Promise<{ titleValues: any[]; isbnValues: any[]; bookIDValues: any[] }> {
  const titleBlockIDs = new Set(titleValues.map(getValueBlockID).filter(Boolean));
  const isbnBlockIDs = new Set(isbnValues.map(getValueBlockID).filter(Boolean));
  const bookIDBlockIDs = new Set(bookIDValues.map(getValueBlockID).filter(Boolean));

  const orphanBlockIDs = Array.from(
    new Set<string>([
      ...[...isbnBlockIDs].filter((id) => !titleBlockIDs.has(id)) as string[],
      ...[...bookIDBlockIDs].filter((id) => !titleBlockIDs.has(id)) as string[],
    ])
  );

  if (orphanBlockIDs.length > 0) {
    await removeAttributeViewBlocks(avID, orphanBlockIDs);
    const db = await getAttributeView(avID);
    const keyValues = db?.av?.keyValues || [];

    const bookIDKey = keyValues.find((kv: any) => kv.key?.name === "bookID");
    const isbnKey = keyValues.find((kv: any) => kv.key?.name === "ISBN");
    const titleKey = keyValues.find((kv: any) => kv.key?.name === "书名");

    return {
      titleValues: titleKey?.values || [],
      isbnValues: isbnKey?.values || [],
      bookIDValues: bookIDKey?.values || [],
    };
  }

  return { titleValues, isbnValues, bookIDValues };
}

export async function attachWereadApiLocalNoteDocs(
  plugin: WereadPluginLike,
  books: Array<{
    bookID?: string;
    bookId?: string;
    title?: string;
    isbn?: string;
    sourceType?: string;
    [key: string]: any;
  }>
): Promise<Array<{
  localDocBlockID?: string;
  localDocMatchType?: "bookID" | "ISBN" | "title";
  [key: string]: any;
}>> {
  try {
    const { titleValues, isbnValues, bookIDValues } = await loadDatabaseView(plugin);

    const rows = buildRowsByTitle(titleValues, isbnValues, bookIDValues, true);
    const rowArray = Array.from(rows.values());
    const bindings = await validateNoteDocumentBindings(rowArray.map((row) => row.docBlockID));

    const bookIDIndex = new Map<string, BookRow>();
    for (const row of rowArray) {
      if (row.bookID) {
        bookIDIndex.set(row.bookID, row);
      }
    }

    const isbnIndex = new Map<string, BookRow>();
    for (const row of rowArray) {
      if (row.isbn) {
        isbnIndex.set(row.isbn, row);
      }
    }

    const titleCount = new Map<string, number>();
    for (const row of rowArray) {
      if (row.title) {
        titleCount.set(row.title, (titleCount.get(row.title) || 0) + 1);
      }
    }
    const titleIndex = new Map<string, BookRow>();
    for (const row of rowArray) {
      if (row.title && titleCount.get(row.title) === 1) {
        titleIndex.set(row.title, row);
      }
    }

    return books.map((book) => {
      const cleanBook = { ...book };
      delete cleanBook.localDocBlockID;
      delete cleanBook.localDocCandidateID;
      delete cleanBook.localDocId;
      delete cleanBook.noteDocId;
      delete cleanBook.localDocMatchType;

      const bookID = book.bookID || book.bookId || "";
      const isbn = normalizeISBN(book.isbn || "").toUpperCase();
      const title = book.title || "";

      let matchedRow: BookRow | undefined;
      let matchType: "bookID" | "ISBN" | "title" | undefined;

      if (bookID && bookIDIndex.has(bookID)) {
        matchedRow = bookIDIndex.get(bookID);
        matchType = "bookID";
      } else if (isbn && isbnIndex.has(isbn)) {
        matchedRow = isbnIndex.get(isbn);
        matchType = "ISBN";
      } else if (title && titleIndex.has(title)) {
        matchedRow = titleIndex.get(title);
        matchType = "title";
      }

      const binding = getNoteDocumentBinding(matchedRow?.docBlockID, bindings);
      if (matchedRow && binding.state === "bound" && binding.documentId) {
        return {
          ...cleanBook,
          localDocBlockID: binding.documentId,
          localDocCandidateID: binding.candidateId,
          noteDocumentBindingState: binding.state,
          localDocMatchType: matchType,
        };
      }

      return {
        ...cleanBook,
        localDocCandidateID: binding.candidateId,
        noteDocumentBindingState: binding.state,
        ...(matchedRow && matchType ? { localDocMatchType: matchType } : {}),
      };
    });
  } catch (error) {
    console.error("[attachWereadApiLocalNoteDocs] load database bindings failed:", error);
    const cachedBindings = await validateNoteDocumentBindings(
      books.map((book) => String(
        book.localDocBlockID || book.localDocCandidateID || book.noteDocId || book.localDocId || ""
      ).trim())
    );
    return books.map((book) => {
      const candidateId = String(
        book.localDocBlockID || book.localDocCandidateID || book.noteDocId || book.localDocId || ""
      ).trim();
      const binding = getNoteDocumentBinding(candidateId, cachedBindings);
      const cleanBook = { ...book };
      delete cleanBook.localDocBlockID;
      delete cleanBook.localDocCandidateID;
      delete cleanBook.localDocId;
      delete cleanBook.noteDocId;
      delete cleanBook.localDocMatchType;

      return {
        ...cleanBook,
        ...(binding.documentId ? { localDocBlockID: binding.documentId } : {}),
        localDocCandidateID: binding.candidateId,
        noteDocumentBindingState: binding.state,
        ...(binding.documentId && book.localDocMatchType ? { localDocMatchType: book.localDocMatchType } : {}),
      };
    });
  }
}

export async function findWereadApiBookTargetDoc(
  plugin: WereadPluginLike,
  target: {
    bookID: string;
    title?: string;
    isbn?: string;
  },
  options?: {
    cleanupOrphans?: boolean;
  }
): Promise<{
  success: boolean;
  blockID?: string;
  avID?: string;
  title?: string;
  matchType?: "bookID" | "ISBN" | "title";
  message: string;
}> {
  try {
    const { avID, titleValues: rawTitleValues, isbnValues: rawIsbnValues, bookIDValues: rawBookIDValues } = await loadDatabaseView(plugin);

    let titleValues = rawTitleValues;
    let isbnValues = rawIsbnValues;
    let bookIDValues = rawBookIDValues;

    if (options?.cleanupOrphans) {
      const cleaned = await cleanOrphansAndReload(avID, titleValues, isbnValues, bookIDValues);
      titleValues = cleaned.titleValues;
      isbnValues = cleaned.isbnValues;
      bookIDValues = cleaned.bookIDValues;
    }

    const targetIsbn = normalizeISBN(target.isbn || "").toUpperCase();
    const targetTitle = target.title || "";

    // 1. 直接扫描 bookIDValues
    const bookIDDirectMatch = bookIDValues.find((v) => getValueText(v) === target.bookID);
    if (bookIDDirectMatch) {
      const docBlockID = resolveDocIDFromMatchedValue(bookIDDirectMatch, titleValues);
      if (!docBlockID) {
        return {
          success: false,
          avID,
          title: target.title,
          message: "数据库行已匹配，但主键列未绑定真实文档 ID",
        };
      }
      const validation = await validateTargetDocBlock(docBlockID);
      if (!validation.valid) {
        return {
          success: false,
          avID,
          title: target.title,
          message: `写入目标 ${docBlockID} 校验失败：${validation.reason || "数据库行已匹配，但该行尚未绑定为真实读书笔记文档"}`,
        };
      }
      return {
        success: true,
        blockID: docBlockID,
        avID,
        title: target.title,
        matchType: "bookID",
        message: "匹配成功",
      };
    }

    // 2. 直接扫描 isbnValues
    if (targetIsbn) {
      const isbnDirectMatch = isbnValues.find((v) => normalizeISBN(getValueText(v)).toUpperCase() === targetIsbn);
      if (isbnDirectMatch) {
        const docBlockID = resolveDocIDFromMatchedValue(isbnDirectMatch, titleValues);
        if (!docBlockID) {
          return {
            success: false,
            avID,
            title: target.title,
            message: "数据库行已匹配，但主键列未绑定真实文档 ID",
          };
        }
        const validation = await validateTargetDocBlock(docBlockID);
        if (!validation.valid) {
          return {
            success: false,
            avID,
            title: target.title,
            message: `写入目标 ${docBlockID} 校验失败：${validation.reason || "数据库行已匹配，但该行尚未绑定为真实读书笔记文档"}`,
          };
        }
        return {
          success: true,
          blockID: docBlockID,
          avID,
          title: target.title,
          matchType: "ISBN",
          message: "匹配成功",
        };
      }
    }

    // 3. 最后才用行构建+唯一书名匹配
    const rows = buildRowsByTitle(titleValues, isbnValues, bookIDValues);
    const rowArray = Array.from(rows.values());

    const titleMatchRows = rowArray.filter((r) => r.title === targetTitle);
    if (titleMatchRows.length === 1) {
      const docBlockID = titleMatchRows[0].docBlockID;
      if (!docBlockID) {
        return {
          success: false,
          avID,
          title: target.title,
          message: "数据库行已匹配，但主键列未绑定真实文档 ID",
        };
      }
      const validation = await validateTargetDocBlock(docBlockID);
      if (!validation.valid) {
        return {
          success: false,
          avID,
          title: target.title,
          message: `写入目标 ${docBlockID} 校验失败：${validation.reason || "数据库行已匹配，但该行尚未绑定为真实读书笔记文档"}`,
        };
      }
      return {
        success: true,
        blockID: docBlockID,
        avID,
        title: target.title,
        matchType: "title",
        message: "匹配成功",
      };
    }

    if (titleMatchRows.length > 1) {
      return {
        success: false,
        avID,
        title: target.title,
        message: "存在多个同名书籍，请使用 bookID 或 ISBN 匹配",
      };
    }

    return {
      success: false,
      avID,
      title: target.title,
      message: "未找到对应的读书笔记文档，请先确保数据库中已有这本书，并填写 bookID 或 ISBN",
    };
  } catch (error: any) {
    return {
      success: false,
      title: target.title,
      message: error?.message || "查找目标文档过程中发生未知错误",
    };
  }
}
