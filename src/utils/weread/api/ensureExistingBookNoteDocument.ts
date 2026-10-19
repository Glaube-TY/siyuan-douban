import { WEREAD_IDENTITY_READBACK_DELAYS, wereadBookIdentityError } from "./wereadBookIdentityDiagnostics";
import { createDocWithMd, getAttributeView, reloadAttributeView, sql } from "@/api";
import { bindBookToNote } from "../../bookHandling/bindBookToNote";
import { buildBookIdentityRows, getAttributeViewValueText, type BookIdentityRow } from "../../bookHandling/bookDeduplication";
import { findBookPrimaryKeyValue } from "../../bookHandling/bookDatabasePrimaryKey";
import { isValidISBN } from "../../bookHandling/isbn";
import { t } from "../../i18n";
import { getNoteDocumentBinding, validateNoteDocumentBindings } from "../../readingManagement/noteDocumentBinding";
import { renderBookNoteTemplate } from "../../template/renderBookNoteTemplate";
import { LOCAL_BOOK_TEMPLATE_VARIABLES, renderLocalBookTemplateVariables, type LocalBookTemplateVariables } from "../../template/renderLocalBookTemplateVariables";
import { getWereadStorageKey, loadWereadSyncedNotebooks } from "../wereadSyncStorage";
import { assertNoWereadOrphanIdentityConflict, bookIdentityFailureMessage, matchWereadBookIdentity } from "./wereadBookIdentity";

/** Only explicit WeRead imports call this; ordinary database-only imports stay database-only. */
export async function ensureExistingBookNoteDocument(
    plugin: any,
    avID: string,
    expectedRow: BookIdentityRow,
    target: { bookID: string; isbn?: string },
    loadTemplateFallback: () => Promise<Partial<LocalBookTemplateVariables>>,
): Promise<BookIdentityRow> {
    const changed = t(plugin, "bookUpdateStateChanged", "本地书籍状态已发生变化，请重新搜索后再试。");
    const cannotRepair = t(plugin, "wereadBookNoteRepairFailed", "已找到本地书籍，但其读书笔记绑定异常，无法自动修复；请检查数据库配置与绑定。");
    const invalid = t(plugin, "wereadBookNoteInvalidBinding", "本地书籍已存在，但笔记绑定指向非文档块，请检查数据库绑定。");
    const fail = (reason: string, actual?: BookIdentityRow, counts?: Record<string, number | boolean>) =>
        wereadBookIdentityError(changed, "note.repair", reason, expectedRow, actual, counts);
    const bindings = await validateNoteDocumentBindings([expectedRow.docBlockID]);
    const binding = getNoteDocumentBinding(expectedRow.docBlockID, bindings);
    if (binding.state === "bound") return expectedRow;
    if (binding.state === "invalid") throw wereadBookIdentityError(binding.blockType ? invalid : cannotRepair, "note.input", "DOCUMENT_BINDING_INVALID", expectedRow);
    const docID = expectedRow.rowBlockID;
    if (!target.bookID || target.bookID.startsWith("MP_WXS_")) throw wereadBookIdentityError(cannotRepair, "note.input", "INVALID_SOURCE_ID", expectedRow);
    if (!docID) throw wereadBookIdentityError(cannotRepair, "note.input", "ROW_ID_MISSING", expectedRow);
    if (expectedRow.docBlockID && expectedRow.docBlockID !== docID) throw wereadBookIdentityError(cannotRepair, "note.input", "DOCUMENT_ID_CHANGED", expectedRow);

    let created = false;
    async function readCurrent() {
        let database: any;
        try { database = await getAttributeView(avID); }
        catch { throw fail("AV_READ_FAILED"); }
        if (!Array.isArray(database?.av?.keyValues)) throw fail("AV_READ_INVALID");
        const keyValues = database.av.keyValues;
        const rows = buildBookIdentityRows(keyValues);
        const history = await loadWereadSyncedNotebooks(plugin);
        assertNoWereadOrphanIdentityConflict(plugin, keyValues, target);
        const match = matchWereadBookIdentity(rows, target, history, false);
        if (match.issue) throw wereadBookIdentityError(bookIdentityFailureMessage(plugin, match), "note.repair", "IDENTITY_" + match.issue.toUpperCase(), expectedRow);
        const row = match.row;
        if (!row || !["bookID", "ISBN"].includes(match.matchType || "")) throw fail("ISBN_MATCH_MISSING", row);
        if (row.rowBlockID !== docID) throw fail("ROW_ID_CHANGED", row);
        if (row.bookID !== expectedRow.bookID) throw fail("BOOKID_ALREADY_SET", row);
        if (row.isbn !== expectedRow.isbn) throw fail("ISBN_MISMATCH", row);
        if (row.title !== expectedRow.title) throw fail("TITLE_CHANGED", row);
        if (row.docBlockID !== expectedRow.docBlockID && !(created && row.docBlockID === docID)) throw fail("DOCUMENT_ID_CHANGED", row);
        if (rows.filter(item => item.rowBlockID === docID).length !== 1) throw fail("ROW_ID_AMBIGUOUS", row);
        if (isValidISBN(row.isbn) && rows.filter(item => item.isbn === row.isbn).length > 1) {
            throw wereadBookIdentityError(bookIdentityFailureMessage(plugin, { matchType: "ISBN", issue: "ambiguous" }), "note.repair", "IDENTITY_AMBIGUOUS", expectedRow, row);
        }
        if (rows.some(item => item.rowBlockID !== docID && item.docBlockID === docID)
            || history.some(item => item?.blockID === docID && getWereadStorageKey(item) && getWereadStorageKey(item) !== target.bookID)) {
            throw wereadBookIdentityError(bookIdentityFailureMessage(plugin, { issue: "shared_doc" }), "note.repair", "SHARED_DOCUMENT_CONFLICT", expectedRow, row);
        }
        const primary = findBookPrimaryKeyValue(keyValues);
        if (!primary?.key?.id || primary.key.type !== "block" || !row.titleValue.block
            || (row.titleValue.keyID && row.titleValue.keyID !== primary.key.id)) throw fail("PRIMARY_KEY_INVALID", row);
        for (const name of ["ISBN", "bookID"]) {
            const columns = keyValues.filter((column: any) => column.key?.name === name);
            const cells = columns.flatMap((column: any) => column.values || [])
                .filter((cell: any) => String(cell.blockID || cell.itemID || "").trim() === docID);
            if (columns.length > 1 || (name === "bookID" && columns.length && (!columns[0].key?.id || columns[0].key.type !== "text"))) throw fail("IDENTITY_COLUMN_INVALID", row, { columns: columns.length });
            if (cells.length > 1) throw fail("IDENTITY_CELL_CONFLICT", row, { cells: cells.length });
        }
        return { row, keyValues, primary };
    }
    async function requireUnusedDocID() {
        const blocks = await sql(`SELECT id, type FROM blocks WHERE id = '${docID.replace(/'/g, "''")}'`);
        if (!Array.isArray(blocks)) throw wereadBookIdentityError(cannotRepair, "note.before_create", "DOCUMENT_READ_INVALID", expectedRow);
        if (blocks.length) throw wereadBookIdentityError(blocks.some(block => block.type !== "d") ? invalid : cannotRepair, "note.before_create", "DOCUMENT_ID_OCCUPIED", expectedRow);
    }

    await readCurrent();
    await requireUnusedDocID();
    const fallback = await loadTemplateFallback();
    const setting = await plugin.loadData("settings.json");
    const databaseID = String(setting?.bookDatabaseID || "");
    const parents = await sql(`SELECT * FROM blocks WHERE id = '${databaseID.replace(/'/g, "''")}'`);
    const parent = parents?.[0];
    if (!parent?.box || !parent.root_id || !parent.hpath
        || parent.markdown?.match(/data-av-id="([^"]+)"/)?.[1] !== avID
        || typeof setting?.noteTemplate !== "string") throw wereadBookIdentityError(cannotRepair, "note.before_create", "DATABASE_BINDING_INVALID", expectedRow);
    const current = await readCurrent();
    const variables = Object.fromEntries(LOCAL_BOOK_TEMPLATE_VARIABLES.map(([field, name]) => {
        const cell = current.keyValues.find((column: any) => column.key?.name === name)?.values
            ?.find((value: any) => String(value.blockID || value.itemID || "").trim() === docID);
        const local = Array.isArray(cell?.mSelect) ? cell.mSelect.map((item: any) => item.content).filter(Boolean).join("、")
            : Array.isArray(cell?.mAsset) ? String(cell.mAsset[0]?.content || "")
            : cell?.date?.content != null ? String(cell.date.content) : getAttributeViewValueText(cell);
        return [field, local || fallback[field] || ""];
    })) as unknown as LocalBookTemplateVariables;
    variables.title = current.row.title || fallback.title || target.bookID;
    const template = renderLocalBookTemplateVariables(setting.noteTemplate, variables);
    await requireUnusedDocID();
    const createdID = await createDocWithMd(parent.box, parent.hpath + "/" + variables.title, "", { id: docID, parentID: parent.root_id });
    if (createdID !== docID) throw wereadBookIdentityError(cannotRepair, "note.create", "DOCUMENT_CREATE_UNVERIFIED", expectedRow);
    created = true;
    await renderBookNoteTemplate(docID, template);

    const readbackDelays = WEREAD_IDENTITY_READBACK_DELAYS;
    let documentBound = false;
    for (const delay of readbackDelays) {
        if (delay) await new Promise(resolve => setTimeout(resolve, delay));
        await readCurrent();
        const state = getNoteDocumentBinding(docID, await validateNoteDocumentBindings([docID]));
        if (state.state === "invalid") throw wereadBookIdentityError(state.blockType ? invalid : cannotRepair, "note.document", "DOCUMENT_BINDING_INVALID", expectedRow);
        if (state.state === "bound") { documentBound = true; break; }
    }
    if (!documentBound) throw wereadBookIdentityError(cannotRepair, "note.document", "DOCUMENT_INDEX_NOT_VISIBLE", expectedRow);
    const beforeBind = await readCurrent();
    await bindBookToNote(avID, docID, { ...beforeBind.row.titleValue, keyID: beforeBind.primary.key.id });
    await reloadAttributeView(avID);
    let lastVerified: BookIdentityRow | undefined;
    let documentVerified = false, attributesVerified = false;
    for (const delay of readbackDelays) {
        if (delay) await new Promise(resolve => setTimeout(resolve, delay));
        const verified = await readCurrent();
        lastVerified = verified.row;
        const verifiedBindings = await validateNoteDocumentBindings([verified.row.docBlockID]);
        const docAttrs = await sql(`SELECT value FROM attributes WHERE block_id = '${docID.replace(/'/g, "''")}' AND name = 'custom-avs'`);
        if (!Array.isArray(docAttrs)) throw wereadBookIdentityError(cannotRepair, "note.readback", "ATTRIBUTE_READ_INVALID", expectedRow, verified.row);
        const binding = getNoteDocumentBinding(verified.row.docBlockID, verifiedBindings);
        if (binding.state === "invalid") throw wereadBookIdentityError(cannotRepair, "note.readback", "DOCUMENT_BINDING_INVALID", expectedRow, verified.row);
        documentVerified = verified.row.docBlockID === docID && binding.state === "bound";
        attributesVerified = docAttrs.some(item => String(item.value || "").split(",").includes(avID));
        if (documentVerified && attributesVerified) return verified.row;
    }
    throw wereadBookIdentityError(t(plugin, "bookUpdateVerificationFailed", "回读验证未通过"), "note.readback", "DOCUMENT_BINDING_READBACK_FAILED", { ...expectedRow, docBlockID: docID }, lastVerified, { documentVerified, attributesVerified });
}
