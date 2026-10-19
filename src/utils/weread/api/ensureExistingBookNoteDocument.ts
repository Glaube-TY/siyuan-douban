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
    const bindings = await validateNoteDocumentBindings([expectedRow.docBlockID]);
    const binding = getNoteDocumentBinding(expectedRow.docBlockID, bindings);
    if (binding.state === "bound") return expectedRow;
    if (binding.state === "invalid") throw new Error(binding.blockType ? invalid : cannotRepair);
    const docID = expectedRow.rowBlockID;
    if (!target.bookID || target.bookID.startsWith("MP_WXS_") || !docID
        || (expectedRow.docBlockID && expectedRow.docBlockID !== docID)) throw new Error(cannotRepair);

    let created = false;
    async function readCurrent() {
        const database = await getAttributeView(avID);
        if (!Array.isArray(database?.av?.keyValues)) throw new Error(changed);
        const keyValues = database.av.keyValues;
        const rows = buildBookIdentityRows(keyValues);
        const history = await loadWereadSyncedNotebooks(plugin);
        assertNoWereadOrphanIdentityConflict(plugin, keyValues, target);
        const match = matchWereadBookIdentity(rows, target, history, false);
        if (match.issue) throw new Error(bookIdentityFailureMessage(plugin, match));
        const row = match.row;
        if (!row || !["bookID", "ISBN"].includes(match.matchType || "")
            || row.rowBlockID !== docID || row.bookID !== expectedRow.bookID
            || row.isbn !== expectedRow.isbn || row.title !== expectedRow.title
            || (row.docBlockID !== expectedRow.docBlockID && !(created && row.docBlockID === docID))
            || rows.filter(item => item.rowBlockID === docID).length !== 1) throw new Error(changed);
        if (isValidISBN(row.isbn) && rows.filter(item => item.isbn === row.isbn).length > 1) {
            throw new Error(bookIdentityFailureMessage(plugin, { matchType: "ISBN", issue: "ambiguous" }));
        }
        if (rows.some(item => item.rowBlockID !== docID && item.docBlockID === docID)
            || history.some(item => item?.blockID === docID && getWereadStorageKey(item) && getWereadStorageKey(item) !== target.bookID)) {
            throw new Error(bookIdentityFailureMessage(plugin, { issue: "shared_doc" }));
        }
        const primary = findBookPrimaryKeyValue(keyValues);
        if (!primary?.key?.id || primary.key.type !== "block" || !row.titleValue.block
            || (row.titleValue.keyID && row.titleValue.keyID !== primary.key.id)) throw new Error(changed);
        for (const name of ["ISBN", "bookID"]) {
            const columns = keyValues.filter((column: any) => column.key?.name === name);
            const cells = columns.flatMap((column: any) => column.values || [])
                .filter((cell: any) => String(cell.blockID || cell.itemID || "").trim() === docID);
            if (columns.length > 1 || cells.length > 1
                || (name === "bookID" && columns.length && (!columns[0].key?.id || columns[0].key.type !== "text"))) throw new Error(changed);
        }
        return { row, keyValues, primary };
    }
    async function requireUnusedDocID() {
        const blocks = await sql(`SELECT id, type FROM blocks WHERE id = '${docID.replace(/'/g, "''")}'`);
        if (!Array.isArray(blocks)) throw new Error(cannotRepair);
        if (blocks.length) throw new Error(blocks.some(block => block.type !== "d") ? invalid : cannotRepair);
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
        || typeof setting?.noteTemplate !== "string") throw new Error(cannotRepair);
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
    if (createdID !== docID) throw new Error(cannotRepair);
    created = true;
    await renderBookNoteTemplate(docID, template);

    // Match the existing AV insert readback delays; retry reads only, never document/binding writes.
    const readbackDelays = [0, 80, 160, 320, 640, 200];
    let documentBound = false;
    for (const delay of readbackDelays) {
        if (delay) await new Promise(resolve => setTimeout(resolve, delay));
        const state = getNoteDocumentBinding(docID, await validateNoteDocumentBindings([docID]));
        if (state.state === "invalid") throw new Error(state.blockType ? invalid : cannotRepair);
        if (state.state === "bound") { documentBound = true; break; }
    }
    if (!documentBound) throw new Error(cannotRepair);
    const beforeBind = await readCurrent();
    await bindBookToNote(avID, docID, { ...beforeBind.row.titleValue, keyID: beforeBind.primary.key.id });
    await reloadAttributeView(avID);
    for (const delay of readbackDelays) {
        if (delay) await new Promise(resolve => setTimeout(resolve, delay));
        const verified = await readCurrent();
        const verifiedBindings = await validateNoteDocumentBindings([verified.row.docBlockID]);
        const docAttrs = await sql(`SELECT value FROM attributes WHERE block_id = '${docID.replace(/'/g, "''")}' AND name = 'custom-avs'`);
        if (!Array.isArray(docAttrs)) throw new Error(cannotRepair);
        if (verified.row.docBlockID === docID && getNoteDocumentBinding(verified.row.docBlockID, verifiedBindings).state === "bound"
            && docAttrs.some(item => String(item.value || "").split(",").includes(avID))) return verified.row;
    }
    throw new Error(t(plugin, "bookUpdateVerificationFailed", "回读验证未通过"));
}
