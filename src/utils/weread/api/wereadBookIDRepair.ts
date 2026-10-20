import { getAttributeView, sql } from "@/api";
import { buildBookIdentityRows, type BookIdentityRow } from "../../bookHandling/bookDeduplication";
import { findBookPrimaryKeyValue } from "../../bookHandling/bookDatabasePrimaryKey";
import { isValidISBN, normalizeISBN } from "../../bookHandling/isbn";
import { getNoteDocumentBinding, validateNoteDocumentBindings } from "../../readingManagement/noteDocumentBinding";
import { loadPluginStorageJsonStateStrict } from "../../storage/pluginStorageStrict";
import { findConflictingWereadDocBindings, getWereadStorageKey, loadCustomISBNBooksWithMigration, loadWereadSyncedNotebooks } from "../wereadSyncStorage";
import { assertNoWereadOrphanIdentityConflict, claimWereadBookIDOnExistingRow, matchWereadBookIdentity } from "./wereadBookIdentity";
import { wereadBookIdentityError } from "./wereadBookIdentityDiagnostics";
import { tryRunWereadSync } from "./wereadSyncRunGuard";
import { t } from "../../i18n";

export type WereadBookIDRepairStatus = "eligible" | "already_linked" | "conflict" | "invalid_binding" | "insufficient_evidence" | "read_error";
export interface WereadBookIDRepairSnapshot {
    bookID: string;
    databaseID: string;
    avID: string;
    row: BookIdentityRow;
    bookIDKeyID: string;
    bookIDCellID?: string;
    evidence: string;
}
export interface WereadBookIDRepairCandidate {
    bookID: string;
    sourceTitle: string;
    localTitle: string;
    isbn: string;
    status: WereadBookIDRepairStatus;
    reasonCode: string;
    snapshot?: WereadBookIDRepairSnapshot;
}
export interface WereadBookIDRepairInspection {
    status: "ok" | "read_error" | "insufficient_evidence";
    reasonCode: string;
    items: WereadBookIDRepairCandidate[];
}
export interface WereadBookIDRepairResult {
    status: WereadBookIDRepairStatus | "success";
    reasonCode: string;
    stage?: string;
}

const object = (value: any) => value !== null && typeof value === "object" && !Array.isArray(value);
const validID = (value: any) => typeof value === "string" && /^\d{14}-[a-z0-9]{7}$/.test(value);
const ordinary = (record: any) => record.sourceType !== "weread_mp_account" && !getWereadStorageKey(record).startsWith("MP_WXS_");
function check(condition: unknown, reasonCode: string): asserts condition {
    if (!condition) throw Object.assign(new Error(reasonCode), { reasonCode });
}

/** This management inspection never migrates, imports, repairs documents or saves storage. */
export async function inspectWereadBookIDRepairCandidates(plugin: any): Promise<WereadBookIDRepairInspection> {
    let storageFailure = "";
    try {
        const readonlyPlugin = {
            name: plugin.name, i18n: plugin.i18n,
            loadDataStrict: async (key: string) => {
                try { return await loadPluginStorageJsonStateStrict(plugin, key); }
                catch (error) {
                    storageFailure = /插件存储 JSON 格式无效|插件存储文件内容为空/.test(error?.message || "") || ["STORAGE_JSON_INVALID", "STORAGE_EMPTY_BODY"].includes(error?.diagnosticCode) ? "STORAGE_CORRUPT" : "STORAGE_READ_FAILED";
                    throw error;
                }
            },
            saveData: async () => { check(false, "READ_ONLY_VIOLATION"); },
        };
        const [settings, historyState, temporary, custom] = await Promise.all([
            readonlyPlugin.loadDataStrict("settings.json"),
            readonlyPlugin.loadDataStrict("weread_notebooks"),
            readonlyPlugin.loadDataStrict("temporary_weread_notebooksList"),
            loadCustomISBNBooksWithMigration(readonlyPlugin, { migrate: false }),
        ]);
        check(!historyState.exists || Array.isArray(historyState.value), "HISTORY_INVALID");
        const history = await loadWereadSyncedNotebooks({ name: plugin.name, loadDataStrict: async () => historyState });
        if (!settings.exists) return { status: "insufficient_evidence", reasonCode: "SETTINGS_MISSING", items: [] };
        check(object(settings.value), "SETTINGS_INVALID");
        const databaseID = (settings.value as any).bookDatabaseID;
        if (!databaseID) return { status: "insufficient_evidence", reasonCode: "DATABASE_MISSING", items: [] };
        check(validID(databaseID), "DATABASE_ID_INVALID");
        const cache = !temporary.exists || temporary.value === null ? [] : temporary.value;
        check(Array.isArray(cache), "TEMPORARY_CACHE_INVALID");
        const records = [...history, ...cache, ...custom];
        for (const record of records) {
            check(object(record), "SOURCE_RECORD_INVALID");
            const ids = [record.bookID, record.bookId, record.syncID].filter(value => value != null && value !== "");
            check(ids.every(value => typeof value === "string" || (typeof value === "number" && Number.isFinite(value))) && new Set(ids.map(value => String(value).trim())).size <= 1, "SOURCE_ID_INVALID");
            for (const key of ["title", "sourceType", "blockID"]) check(record[key] == null || typeof record[key] === "string", "SOURCE_RECORD_INVALID");
            for (const key of ["isbn", "customISBN"]) check(record[key] == null || typeof record[key] === "string" || (typeof record[key] === "number" && Number.isFinite(record[key])), "SOURCE_ISBN_INVALID");
        }
        const blocks = await sql(`SELECT id, markdown FROM blocks WHERE id = '${databaseID}'`);
        check(Array.isArray(blocks) && blocks.length === 1 && blocks[0]?.id === databaseID && typeof blocks[0].markdown === "string", "DATABASE_BLOCK_INVALID");
        const avID = blocks[0].markdown.match(/data-av-id="([^"]+)"/)?.[1];
        check(validID(avID), "AV_ID_INVALID");
        const database = await getAttributeView(avID);
        check(Array.isArray(database?.av?.keyValues), "AV_READ_INVALID");
        const columns = database.av.keyValues;
        check(columns.every((column: any) => object(column) && object(column.key)), "AV_COLUMN_INVALID");
        const primary = findBookPrimaryKeyValue(columns);
        check(primary?.key.type === "block" && validID(primary.key.id) && columns.filter((column: any) => column.key.type === "block").length === 1, "PRIMARY_KEY_INVALID");
        const identityColumns = columns.filter((column: any) => column === primary || ["ISBN", "bookID"].includes(column.key.name));
        for (const column of identityColumns) {
            check(validID(column.key.id) && Array.isArray(column.values), "IDENTITY_COLUMN_INVALID");
            for (const cell of column.values) {
                check(object(cell) && validID(cell.blockID || cell.itemID), "IDENTITY_CELL_INVALID");
                for (const value of [cell.id, cell.block?.id]) check(value == null || value === "" || validID(value), "IDENTITY_CELL_INVALID");
                const value = cell.block?.content ?? cell.text?.content ?? cell.number?.formattedContent ?? cell.number?.content;
                check(typeof value === "string" || (typeof value === "number" && Number.isFinite(value)), "IDENTITY_VALUE_INVALID");
            }
        }
        const rows = buildBookIdentityRows(columns);
        const grouped = new Map<string, any[]>();
        for (const record of records) {
            const id = getWereadStorageKey(record);
            if (id) grouped.set(id, [...(grouped.get(id) || []), record]);
        }
        const validISBNs = (items: any[]) => new Set(items.flatMap(item => [item.isbn, item.customISBN]).map(normalizeISBN).filter(isValidISBN));
        const sharedHistory = findConflictingWereadDocBindings(history);
        const docIDs = [...new Set(rows.map(row => row.docBlockID).filter(Boolean))];
        check(docIDs.every(validID), "DOCUMENT_ID_INVALID");
        const bindings = await validateNoteDocumentBindings(docIDs);
        const attrs = docIDs.length ? await sql(`SELECT block_id, value FROM attributes WHERE block_id IN (${docIDs.map(id => `'${id}'`).join(",")}) AND name = 'custom-avs' LIMIT 100000`) : [];
        check(Array.isArray(attrs) && attrs.every(attr => object(attr) && docIDs.includes(attr.block_id) && typeof attr.value === "string"), "ATTRIBUTE_READ_INVALID");
        const items = [...new Set(history.filter(ordinary).map(getWereadStorageKey).filter(Boolean))].map(bookID => {
            const sourceRecords = grouped.get(bookID)!;
            const past = history.filter(record => getWereadStorageKey(record) === bookID);
            const isbns = validISBNs(sourceRecords), isbn = [...isbns][0] || "";
            const candidate: WereadBookIDRepairCandidate = { bookID, sourceTitle: cache.find(record => getWereadStorageKey(record) === bookID && record.title)?.title || sourceRecords.find(record => record.title)?.title || bookID, localTitle: "", isbn, status: "insufficient_evidence", reasonCode: "ISBN_MISSING" };
            const state = (status: WereadBookIDRepairStatus, reasonCode: string) => ({ ...candidate, status, reasonCode });
            if (sourceRecords.some(record => !ordinary(record))) return state("conflict", "SOURCE_TYPE_CONFLICT");
            if (!isbns.size) return candidate;
            if (isbns.size > 1) return state("conflict", "SOURCE_ISBN_CONFLICT");
            const isbnRows = rows.filter(row => row.isbn === isbn);
            if (isbnRows.length !== 1) return state(isbnRows.length ? "conflict" : "insufficient_evidence", isbnRows.length ? "ISBN_AMBIGUOUS" : "ISBN_MATCH_MISSING");
            const row = isbnRows[0]; candidate.localTitle = row.title;
            if (rows.filter(item => item.rowBlockID === row.rowBlockID).length !== 1 || !validID(row.rowBlockID)) return state("conflict", "ROW_ID_AMBIGUOUS");
            if (!row.titleValue.block || (row.titleValue.keyID && row.titleValue.keyID !== primary.key.id)) return state("conflict", "PRIMARY_KEY_INVALID");
            const bookColumns = columns.filter((column: any) => column.key.name === "bookID");
            if (!bookColumns.length) return state("insufficient_evidence", "BOOKID_COLUMN_MISSING");
            if (bookColumns.length !== 1 || bookColumns[0].key.type !== "text") return state("conflict", "BOOKID_COLUMN_INVALID");
            if (columns.filter((column: any) => column.key.name === "ISBN").length !== 1) return state("conflict", "ISBN_COLUMN_INVALID");
            const cells = bookColumns[0].values.filter((cell: any) => String(cell.blockID || cell.itemID).trim() === row.rowBlockID);
            if (identityColumns.some((column: any) => column.values.filter((cell: any) => String(cell.blockID || cell.itemID).trim() === row.rowBlockID).length > 1)) return state("conflict", "IDENTITY_CELL_CONFLICT");
            try { assertNoWereadOrphanIdentityConflict(plugin, columns, { bookID, isbn }); }
            catch { return state("conflict", "ORPHAN_IDENTITY_CONFLICT"); }
            const match = matchWereadBookIdentity(rows, { bookID, isbn }, history, false);
            if (match.issue || match.row?.rowBlockID !== row.rowBlockID || (row.bookID && row.bookID !== bookID)
                || rows.some(other => other.rowBlockID !== row.rowBlockID && other.bookID === bookID)) return state("conflict", "IDENTITY_CONFLICT");
            if ([...grouped].some(([otherID, others]) => otherID !== bookID && others.some(ordinary)
                && (validISBNs(others).has(isbn) || others.some(record => record.blockID && record.blockID === row.docBlockID)
                    || rows.some(other => validISBNs(others).has(other.isbn) && row.docBlockID && other.docBlockID === row.docBlockID)))
                || sharedHistory.has(row.docBlockID)
                || rows.some(other => other.rowBlockID !== row.rowBlockID && row.docBlockID && other.docBlockID === row.docBlockID)) return state("conflict", "SHARED_SOURCE_CONFLICT");
            const binding = getNoteDocumentBinding(row.docBlockID, bindings);
            if (binding.state === "invalid" && !binding.blockType) return state("read_error", "DOCUMENT_READ_FAILED");
            if (binding.state !== "bound" || !attrs.some(attr => attr.block_id === row.docBlockID && attr.value.split(",").includes(avID))) return state("invalid_binding", "DOCUMENT_AV_BINDING_INVALID");
            if (past.some(record => !record.blockID)) return state("insufficient_evidence", "HISTORY_DOCUMENT_MISSING");
            if (past.some(record => record.blockID !== row.docBlockID)) return state("conflict", "HISTORY_DOCUMENT_CHANGED");
            const evidence = JSON.stringify({ primaryKeyID: primary.key.id, primaryCellID: row.titleValue.id, isbnKeyID: identityColumns.find((column: any) => column.key.name === "ISBN").key.id,
                sources: sourceRecords.map(record => [getWereadStorageKey(record), record.sourceType || "", record.title || "", normalizeISBN(record.isbn), normalizeISBN(record.customISBN), record.blockID || "", record.pendingImport]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))) });
            candidate.snapshot = { bookID, databaseID, avID, row, bookIDKeyID: bookColumns[0].key.id, bookIDCellID: cells[0]?.id, evidence };
            return state(row.bookID === bookID ? "already_linked" : "eligible", row.bookID === bookID ? "BOOKID_LINKED" : "BOOKID_MISSING");
        });
        const readFailed = items.some(item => item.status === "read_error");
        return { status: readFailed ? "read_error" : historyState.exists ? "ok" : "insufficient_evidence", reasonCode: readFailed ? "DOCUMENT_READ_FAILED" : !historyState.exists ? "HISTORY_MISSING" : history.length ? "INSPECTED" : "NO_SYNCED_HISTORY", items };
    } catch (error) {
        return { status: "read_error", reasonCode: storageFailure || error?.reasonCode || (error?.name === "WereadCustomISBNStorageError" ? "CUSTOM_ISBN_INVALID" : "READ_FAILED"), items: [] };
    }
}

function sameSnapshot(expected: WereadBookIDRepairSnapshot, current: WereadBookIDRepairSnapshot): boolean {
    return expected?.bookID === current.bookID && expected.databaseID === current.databaseID && expected.avID === current.avID && expected.bookIDKeyID === current.bookIDKeyID && expected.evidence === current.evidence
        && (expected.bookIDCellID === current.bookIDCellID || (!expected.bookIDCellID && current.row.bookID === current.bookID))
        && ["rowBlockID", "docBlockID", "isbn", "title"].every(key => expected.row?.[key] === current.row[key])
        && (expected.row.bookID === current.row.bookID || (!expected.row.bookID && current.row.bookID === current.bookID));
}

/** The caller must obtain explicit confirmation for this single source first. */
export async function repairWereadBookIDForExistingSource(plugin: any, bookID: string, expected: WereadBookIDRepairSnapshot): Promise<WereadBookIDRepairResult> {
    let entered = false;
    try {
        return await tryRunWereadSync("manual", async () => {
            entered = true;
            async function recheck() {
                const inspection = await inspectWereadBookIDRepairCandidates(plugin);
                const current = inspection.items.find(item => item.bookID === bookID);
                if (inspection.status !== "ok") return { failure: { status: inspection.status, reasonCode: inspection.reasonCode } as WereadBookIDRepairResult };
                if (!current?.snapshot || !["eligible", "already_linked"].includes(current.status)) return { failure: { status: current?.status || "insufficient_evidence", reasonCode: current?.reasonCode || "SOURCE_MISSING" } as WereadBookIDRepairResult };
                if (!sameSnapshot(expected, current.snapshot)) return { failure: { status: "conflict", reasonCode: "IDENTITY_SNAPSHOT_CHANGED" } as WereadBookIDRepairResult };
                return { current };
            }
            const before = await recheck();
            if (before.failure) return before.failure;
            if (before.current.status === "already_linked") return { status: "already_linked", reasonCode: "BOOKID_LINKED" };
            const snapshot = before.current.snapshot;
            await claimWereadBookIDOnExistingRow(plugin, snapshot.avID, snapshot.row, { bookID, isbn: before.current.isbn }, {
                existingColumnID: snapshot.bookIDKeyID,
                beforeWrite: async () => {
                    const verified = await recheck();
                    if (verified.failure || verified.current.status !== "eligible") throw Object.assign(wereadBookIdentityError(t(plugin, "wereadRepairStateChanged", "身份证据已变化，已停止关联；请重新检查。"), "claim.before_write", verified.failure?.reasonCode || "BOOKID_ALREADY_SET", snapshot.row, verified.current?.snapshot?.row), { repairStatus: verified.failure?.status || "conflict" });
                },
            });
            const after = await recheck();
            if (after.failure || after.current.status !== "already_linked") return { status: after.failure?.status || "read_error", stage: "claim.readback", reasonCode: after.failure?.reasonCode || "CLAIM_READBACK_FAILED" };
            return { status: "success", reasonCode: "BOOKID_LINKED" };
        });
    } catch (error) {
        const reasonCode = error?.reasonCode || (entered ? "CLAIM_RESULT_UNVERIFIED" : "REPAIR_BUSY");
        const status = error?.repairStatus || (!entered || /CONFLICT|CHANGED|AMBIGUOUS|ALREADY_SET|COLUMN_INVALID/.test(reasonCode) ? "conflict" : reasonCode === "DOCUMENT_BINDING_INVALID" ? "invalid_binding" : "read_error");
        return { status, stage: error?.stage || (entered ? "claim.readback" : "claim.input"), reasonCode };
    }
}
