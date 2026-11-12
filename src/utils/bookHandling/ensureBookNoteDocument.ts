import { createDocWithMdStrict, requestStrict } from "@/api";
import { t } from "../i18n";
import { LOCAL_BOOK_TEMPLATE_VARIABLES, renderLocalBookTemplateVariables, type LocalBookTemplateVariables } from "../template/renderLocalBookTemplateVariables";
import { BOOK_NOTE_READBACK_DELAYS, hasBookNoteContent, readBookNoteKramdown, renderBookNoteTemplate } from "../template/renderBookNoteTemplate";
import { getAttributeViewValueText } from "./bookDeduplication";
import { findBookPrimaryKeyValue } from "./bookDatabasePrimaryKey";
import { bindBookToNote } from "./bindBookToNote";
import { isValidISBN, normalizeISBN } from "./isbn";

export { BOOK_NOTE_READBACK_DELAYS } from "../template/renderBookNoteTemplate";
const quote = (value: string) => "'" + String(value).replace(/'/g, "''") + "'";

async function query(stmt: string): Promise<any[]> {
    const rows = await requestStrict("/api/query/sql", { stmt });
    if (!Array.isArray(rows)) throw new Error("Invalid book note query response");
    return rows;
}

export async function readBookNoteParent(plugin: any, avID: string, databaseBlockID: string) {
    const parents = await query("SELECT * FROM blocks WHERE id = " + quote(databaseBlockID));
    const parent = parents[0];
    if (parents.length !== 1 || !parent?.box || !parent.root_id || !parent.hpath || !parent.path
        || parent.markdown?.match(/data-av-id="([^"]+)"/)?.[1] !== avID) {
        throw new Error(t(plugin, "bookNoteParentInvalid", "笔记保存位置或数据库绑定无效，已停止写入"));
    }
    return parent;
}

export async function readBookNoteTarget(plugin: any, avID: string, rowBlockID: string, book: any, requireContent = true) {
    const changed = () => new Error(t(plugin, "bookUpdateStateChanged", "本地书籍状态已发生变化，请重新搜索后再试。"));
    if (!avID || !rowBlockID || !book.databaseBlockId) throw changed();
    const database = await requestStrict("/api/av/getAttributeView", { id: avID });
    const columns = database?.av?.keyValues;
    if (!Array.isArray(columns) || columns.some((column: any) => column.values != null && !Array.isArray(column.values))) throw changed();
    const primary = findBookPrimaryKeyValue(columns);
    if (primary?.key?.type !== "block" || !primary.key.id || !Array.isArray(primary.values)) throw changed();
    const rows = primary.values.filter((value: any) => value.blockID === rowBlockID);
    const row = rows[0];
    if (rows.length !== 1 || !row?.block || (row.keyID && row.keyID !== primary.key.id)) throw changed();
    if (String(row.block.content || "").trim() !== String(book.title || "").trim()) throw changed();
    const isbn = normalizeISBN(book.ISBN ?? book.isbn);
    if (isValidISBN(isbn)) {
        const isbnColumns = columns.filter((column: any) => column.key?.name === "ISBN");
        if (isbnColumns.length !== 1 || !Array.isArray(isbnColumns[0].values)) throw changed();
        const matches = isbnColumns.flatMap((column: any) => column.values)
            .filter((cell: any) => normalizeISBN(getAttributeViewValueText(cell)) === isbn);
        if (isbnColumns.length !== 1 || matches.length !== 1 || matches[0].blockID !== rowBlockID) throw changed();
    }
    const docID = String(row.block.id || rowBlockID);
    if (row.isDetached === true && row.block.id && docID !== rowBlockID) throw changed();
    if (primary.values.some((value: any) => value.blockID !== rowBlockID && value.block?.id === docID)) throw changed();
    const parent = await readBookNoteParent(plugin, avID, book.databaseBlockId);
    const documents = await query("SELECT id, type, box, path FROM blocks WHERE id = " + quote(docID));
    const document = documents[0];
    if (documents.length > 1 || (document && (document.id !== docID || document.type !== "d")) || (!document && row.block.id && docID !== rowBlockID)) throw changed();
    // An unbound row may resume only its exact document under the configured parent.
    if (document && (!row.block.id || row.isDetached === true)
        && (document.box !== parent.box || document.path !== parent.path.replace(/\.sy$/, "") + "/" + docID + ".sy")) throw changed();
    const content = document ? await readBookNoteKramdown(docID, plugin) : "";
    const attrs = document ? await requestStrict("/api/attr/getBlockAttrs", { id: docID }) : {};
    if (!attrs || Array.isArray(attrs) || typeof attrs !== "object" || (attrs["custom-avs"] !== undefined && typeof attrs["custom-avs"] !== "string")) throw changed();
    const complete = !!document && (!requireContent || hasBookNoteContent(content)) && row.isDetached !== true
        && row.block.id === docID && String(attrs["custom-avs"] || "").split(",").includes(avID);
    return { columns, primary, row, parent, document, docID, content, complete };
}

function noteTemplate(book: any, target: Awaited<ReturnType<typeof readBookNoteTarget>>): string {
    const fallback: LocalBookTemplateVariables = {
        title: book.title || "", subtitle: book.subtitle || "", originalTitle: book.originalTitle || "",
        author: Array.isArray(book.authors) ? book.authors.join("、") : String(book.authors || ""),
        translator: Array.isArray(book.translators) ? book.translators.join("、") : String(book.translators || ""),
        publisher: book.publisher || "未知出版社", publishDate: book.publishDate || "未知日期", producer: book.producer || "",
        isbn: book.ISBN || book.isbn || "", binding: book.binding || "", series: book.series || "",
        doubanRating: book.rating ? String(book.rating) : "无评分", doubanRatingCount: String(book.ratingCount || "0"),
        pages: String(book.pages || ""), price: String(book.price || ""), myRating: book.myRating || "未评分",
        bookCategory: book.bookCategory || "默认分类", readingStatus: book.readingStatus || "未读",
        startDate: book.startDate || "未开始", finishDate: book.finishDate || "未完成", cover: book.cover || "",
        description: book.description || "", authorBio: book.authorBio || "", wereadRating: "", wereadRatingCount: "",
    };
    const variables = Object.fromEntries(LOCAL_BOOK_TEMPLATE_VARIABLES.map(([field, name]) => {
        const cell = target.columns.find((column: any) => column.key?.name === name)?.values
            ?.find((value: any) => value.blockID === target.row.blockID);
        const local = Array.isArray(cell?.mSelect) ? cell.mSelect.map((value: any) => value.content).filter(Boolean).join("、")
            : Array.isArray(cell?.mAsset) ? String(cell.mAsset[0]?.content || "") : getAttributeViewValueText(cell);
        return [field, local || fallback[field]];
    })) as unknown as LocalBookTemplateVariables;
    return renderLocalBookTemplateVariables(book.noteTemplate, variables);
}

/** Complete only this identified row; existing note contents are never replaced. */
export async function ensureBookNoteDocument(plugin: any, avID: string, rowBlockID: string, book: any, requireContent = true): Promise<string> {
    let stage = "verify", docBlockID = rowBlockID;
    try {
        let target = await readBookNoteTarget(plugin, avID, rowBlockID, book, requireContent);
        docBlockID = target.docID;
        if (target.complete) return docBlockID;
        if (requireContent && !hasBookNoteContent(target.content) && (typeof book.noteTemplate !== "string" || !book.noteTemplate.trim())) {
            throw new Error(t(plugin, "bookNoteTemplateEmpty", "请先配置非空的读书笔记模板"));
        }
        if (!target.document) {
            stage = "create";
            const hpath = target.parent.hpath + "/" + book.title;
            const existing = await query("SELECT id FROM blocks WHERE type = 'd' AND box = " + quote(target.parent.box)
                + " AND hpath = " + quote(hpath));
            if (existing.length) throw new Error(t(plugin, "bookNotePathOccupied", "笔记保存位置已有文档，已停止创建以保护现有内容"));
            let createError: unknown, createdID: unknown;
            try {
                createdID = await createDocWithMdStrict(target.parent.box, hpath, "", { id: docBlockID, parentID: target.parent.root_id });
                if (createdID !== docBlockID) throw new Error(t(plugin, "bookNoteCreateUnverified", "文档创建结果与目标不一致，已停止写入"));
            } catch (error) { createError = error; }
            if (createdID !== undefined && createdID !== docBlockID) throw createError;
            for (const delay of BOOK_NOTE_READBACK_DELAYS) {
                if (delay) await new Promise(resolve => setTimeout(resolve, delay));
                target = await readBookNoteTarget(plugin, avID, rowBlockID, book, requireContent);
                if (target.docID !== docBlockID) throw new Error(t(plugin, "bookUpdateStateChanged", "本地书籍状态已发生变化，请重新搜索后再试。"));
                if (target.document) break;
            }
            if (!target.document) throw createError || new Error(t(plugin, "bookNoteCreateUnverified", "文档创建结果与目标不一致，已停止写入"));
        }
        stage = "template";
        target = await readBookNoteTarget(plugin, avID, rowBlockID, book, requireContent);
        if (target.docID !== docBlockID) throw new Error(t(plugin, "bookUpdateStateChanged", "本地书籍状态已发生变化，请重新搜索后再试。"));
        if (!hasBookNoteContent(target.content)) await renderBookNoteTemplate(docBlockID, noteTemplate(book, target), plugin, requireContent);
        stage = "binding";
        for (const delay of BOOK_NOTE_READBACK_DELAYS) {
            if (delay) await new Promise(resolve => setTimeout(resolve, delay));
            target = await readBookNoteTarget(plugin, avID, rowBlockID, book, requireContent);
            if (target.docID !== docBlockID) throw new Error(t(plugin, "bookUpdateStateChanged", "本地书籍状态已发生变化，请重新搜索后再试。"));
            if (target.document && (!requireContent || hasBookNoteContent(target.content))) break;
        }
        if (!target.document || (requireContent && !hasBookNoteContent(target.content))) throw new Error(t(plugin, "bookNoteContentUnverified", "笔记正文回读验证未通过，请稍后补全"));
        let bindError: unknown;
        try { await bindBookToNote(avID, docBlockID, { ...target.row, keyID: target.primary.key.id }); }
        catch (error) { bindError = error; }
        stage = "readback";
        for (const delay of BOOK_NOTE_READBACK_DELAYS) {
            if (delay) await new Promise(resolve => setTimeout(resolve, delay));
            target = await readBookNoteTarget(plugin, avID, rowBlockID, book, requireContent);
            if (target.docID !== docBlockID) break;
            if (target.complete) return docBlockID;
        }
        throw bindError || new Error(t(plugin, "bookNoteBindingUnverified", "笔记绑定回读验证未通过，请稍后补全"));
    } catch (error: any) {
        throw Object.assign(error instanceof Error ? error : new Error(String(error)), { noteStage: stage, rowBlockID, docBlockID });
    }
}

export function bookNoteFailureResult(plugin: any, error: any, rowBlockID: string) {
    const stages: Record<string, string> = {
        verify: t(plugin, "bookNoteStageVerify", "状态校验"),
        create: t(plugin, "bookNoteStageCreate", "创建文档"),
        template: t(plugin, "bookNoteStageTemplate", "生成正文"),
        binding: t(plugin, "bookNoteStageBinding", "绑定文档"),
        readback: t(plugin, "bookNoteStageReadback", "验证绑定"),
    };
    return {
        code: 1, rowBlockID, docBlockID: error?.docBlockID, partial: true, stage: error?.noteStage,
        msg: t(plugin, "bookNotePartialFailed", "书籍已入库，笔记未完成（{stage}）：{error}", {
            stage: stages[error?.noteStage] || stages.verify,
            error: error?.message || t(plugin, "uiUnknownError", "未知错误"),
        }),
    };
}
