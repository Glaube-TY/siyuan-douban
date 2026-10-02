import { sql, getAttributeView, removeAttributeViewBlocks } from "@/api";
import { getNoteDocumentBinding, validateNoteDocumentBindings } from "../../readingManagement/noteDocumentBinding";
import { findBookPrimaryKeyValue } from "../../bookHandling/bookDatabasePrimaryKey";
import { buildBookIdentityRows } from "../../bookHandling/bookDeduplication";
import { loadWereadSyncedNotebooks } from "../wereadSyncStorage";
import { matchWereadBookIdentity, bookIdentityFailureMessage } from "./wereadBookIdentity";

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

async function loadDatabaseView(plugin: WereadPluginLike): Promise<{ avID: string; keyValues: any[] }> {
  const settings = await plugin.loadData("settings.json");
  const databaseBlockId = settings?.bookDatabaseID || "";
  if (!databaseBlockId) throw new Error("未设置书籍数据库");
  const blockResult = await sql(`SELECT * FROM blocks WHERE id = "${databaseBlockId}"`);
  const avID = blockResult[0]?.markdown?.match(/data-av-id="([^"]+)"/)?.[1] || "";
  if (!avID) throw new Error("未找到数据库视图 ID");
  const db = await getAttributeView(avID);
  if (!Array.isArray(db?.av?.keyValues)) throw new Error("书籍数据库列数据格式异常");
  return { avID, keyValues: db.av.keyValues };
}

async function cleanOrphansAndReload(avID: string, keyValues: any[]): Promise<any[]> {
  const titleBlockIDs = new Set((findBookPrimaryKeyValue(keyValues)?.values || []).map((v: any) => v.blockID));
  const orphanBlockIDs = Array.from(new Set<string>(
    keyValues.filter((kv: any) => kv.key?.name === "ISBN" || kv.key?.name === "bookID")
      .flatMap((kv: any) => (kv.values || []).map((v: any) => v.blockID))
      .filter((id: string) => id && !titleBlockIDs.has(id))
  ));
  if (!orphanBlockIDs.length) return keyValues;
  await removeAttributeViewBlocks(avID, orphanBlockIDs);
  const db = await getAttributeView(avID);
  if (!Array.isArray(db?.av?.keyValues)) throw new Error("书籍数据库列数据格式异常");
  return db.av.keyValues;
}

export async function attachWereadApiLocalNoteDocs(
  plugin: WereadPluginLike,
  books: Array<{ bookID?: string; bookId?: string; title?: string; isbn?: string; sourceType?: string; [key: string]: any }>
): Promise<Array<{ localDocBlockID?: string; localDocMatchType?: "bookID" | "ISBN" | "title"; [key: string]: any }>> {
  const cleanBook = (book: any) => {
    const { localDocBlockID, localDocCandidateID, localDocId, noteDocId, localDocMatchType, ...rest } = book;
    return rest;
  };
  try {
    const { keyValues } = await loadDatabaseView(plugin);
    const rows = buildBookIdentityRows(keyValues);
    const history = await loadWereadSyncedNotebooks(plugin);
    const matches = books.map(book => matchWereadBookIdentity(rows, {
      bookID: book.bookID || book.bookId || "", title: book.title, isbn: book.isbn,
    }, history));
    // Also reject two currently visible sources claiming the same unowned legacy row.
    const owners = new Map<string, Set<string>>();
    matches.forEach((match, index) => {
      const doc = match.row?.docBlockID;
      const id = books[index].bookID || books[index].bookId || "";
      if (!match.issue && doc && id && !id.startsWith("MP_WXS_")) {
        if (!owners.has(doc)) owners.set(doc, new Set());
        owners.get(doc)!.add(id);
      }
    });
    const bindings = await validateNoteDocumentBindings(rows.map(row => row.docBlockID));
    return books.map((book, index) => {
      const match = matches[index];
      const shared = match.row && (owners.get(match.row.docBlockID)?.size || 0) > 1;
      if (match.issue || shared) return { ...cleanBook(book), noteDocumentBindingState: "invalid" };
      const binding = getNoteDocumentBinding(match.row?.docBlockID, bindings);
      return {
        ...cleanBook(book),
        ...(binding.documentId ? { localDocBlockID: binding.documentId } : {}),
        localDocCandidateID: binding.candidateId,
        noteDocumentBindingState: binding.state,
        ...(match.row && match.matchType ? { localDocMatchType: match.matchType } : {}),
      };
    });
  } catch (error) {
    console.error("[attachWereadApiLocalNoteDocs] load database bindings failed:", error);
    // A cached document ID proves existence, not book identity. Never revive an unverified binding.
    return books.map(book => ({ ...cleanBook(book), noteDocumentBindingState: "invalid" }));
  }
}

export async function findWereadApiBookTargetDoc(
  plugin: WereadPluginLike,
  target: { bookID: string; title?: string; isbn?: string },
  options?: { cleanupOrphans?: boolean }
): Promise<{ success: boolean; blockID?: string; avID?: string; title?: string; matchType?: "bookID" | "ISBN" | "title"; message: string }> {
  try {
    const database = await loadDatabaseView(plugin);
    const keyValues = options?.cleanupOrphans
      ? await cleanOrphansAndReload(database.avID, database.keyValues)
      : database.keyValues;
    const history = target.bookID.startsWith("MP_WXS_") ? [] : await loadWereadSyncedNotebooks(plugin);
    const match = matchWereadBookIdentity(buildBookIdentityRows(keyValues), target, history);
    const context = { avID: database.avID, title: target.title };
    if (match.issue) return { ...context, success: false, message: bookIdentityFailureMessage(plugin, match) };
    if (!match.row) return {
      ...context, success: false,
      message: "未找到对应的读书笔记文档，请先确保数据库中已有这本书，并填写 bookID 或 ISBN",
    };
    const docBlockID = match.row.docBlockID;
    if (!docBlockID) return { ...context, success: false, message: "数据库行已匹配，但主键列未绑定真实文档 ID" };
    const validation = await validateTargetDocBlock(docBlockID);
    if (!validation.valid) return {
      ...context, success: false,
      message: `写入目标 ${docBlockID} 校验失败：${validation.reason || "数据库行已匹配，但该行尚未绑定为真实读书笔记文档"}`,
    };
    return { ...context, success: true, blockID: docBlockID, matchType: match.matchType, message: "匹配成功" };
  } catch (error: any) {
    return { success: false, title: target.title, message: error?.message || "查找目标文档过程中发生未知错误" };
  }
}
