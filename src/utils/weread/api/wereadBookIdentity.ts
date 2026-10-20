import { buildBookIdentityRows, getAttributeViewValueText, matchBookIdentity, type BookIdentityMatch, type BookIdentityRow, type BookIdentityTarget } from "../../bookHandling/bookDeduplication";
import { findConflictingWereadDocBindings, getWereadStorageKey, loadWereadSyncedNotebooks } from "../wereadSyncStorage";
import { t } from "../../i18n";
import { addAttributeViewKeyStrict, getAttributeView, reloadAttributeView, setAttributeViewBlockAttrStrict } from "@/api";
import { isValidISBN, normalizeISBN } from "../../bookHandling/isbn";
import { WEREAD_IDENTITY_READBACK_DELAYS, wereadBookIdentityError } from "./wereadBookIdentityDiagnostics";
import { generateUniqueBlocked } from "../../core/formatOp";
import { getNoteDocumentBinding, validateNoteDocumentBindings } from "../../readingManagement/noteDocumentBinding";

export function matchWereadBookIdentity(
    rows: BookIdentityRow[],
    target: BookIdentityTarget,
    history: any[],
    allowTitle = true,
): BookIdentityMatch {
    const bookID = String(target.bookID || "").trim();
    const match = matchBookIdentity(rows, { ...target, bookID }, allowTitle);
    if (match.issue || !match.row || bookID.startsWith("MP_WXS_")) return match;
    // An explicit DB owner can repair stale history. Weak matches cannot claim another source's document.
    if (bookID && match.row.bookID === bookID) return match;
    const conflicts = findConflictingWereadDocBindings(history);
    const staleTitleBinding = match.matchType === "title" && Array.from(conflicts.values()).some(ids => ids.includes(bookID));
    const otherOwner = history.some(record => (
        record?.sourceType !== "weread_mp_account"
        && !getWereadStorageKey(record).startsWith("MP_WXS_")
        && String(record?.blockID || "").trim() === match.row!.docBlockID
        && getWereadStorageKey(record)
        && getWereadStorageKey(record) !== bookID
    ));
    return staleTitleBinding || otherOwner ? { matchType: match.matchType, issue: "shared_doc" } : match;
}

export function bookIdentityFailureMessage(plugin: any, match: BookIdentityMatch): string {
    if (match.issue === "ambiguous") {
        if (match.matchType === "title") return t(plugin, "wereadIdentityAmbiguousTitle", "存在多个同名书籍，请使用 bookID 或 ISBN 匹配。");
        return t(plugin, "wereadIdentityAmbiguousIdentifier", "数据库中有多个相同 {identifier} 候选，禁止自动选择写入目标。", { identifier: match.matchType || "bookID" });
    }
    if (match.issue === "bookID_conflict") {
        if (match.matchType === "title") return t(plugin, "wereadIdentityTitleConflict", "同名书籍已绑定其他 bookID，禁止按书名写入。");
        return t(plugin, "wereadIdentityISBNBookIDConflict", "同 ISBN 书籍已绑定其他 bookID，禁止写入该文档；请使用 BookID 独立入库。");
    }
    if (match.issue === "isbn_conflict") return t(plugin, "wereadIdentityISBNConflict", "同名书籍的 ISBN 不同，禁止按书名写入。");
    return t(plugin, "wereadIdentitySharedDoc", "不同 bookID 共用同一读书笔记文档，需使用 bookID 或 ISBN 重新确认独立目标。");
}

export async function claimWereadBookIDOnExistingRow(
    plugin: any,
    avID: string,
    expectedRow: BookIdentityRow,
    target: { bookID: string; isbn: string },
    options?: { existingColumnID: string; beforeWrite: () => Promise<void> },
): Promise<void> {
    const bookID = String(target.bookID || "").trim();
    const isbn = normalizeISBN(target.isbn);
    const changed = t(plugin, "bookUpdateStateChanged", "本地书籍状态已发生变化，请重新搜索后再试。");
    const fail = (stage: string, reason: string, actual?: BookIdentityRow, counts?: Record<string, number | boolean>) =>
        wereadBookIdentityError(changed, stage, reason, expectedRow, actual, counts);
    if (!bookID || !isValidISBN(isbn)) throw fail("claim.input", "INVALID_SOURCE_ID");
    if (expectedRow.bookID) throw fail("claim.input", "BOOKID_ALREADY_SET");
    if (!expectedRow.docBlockID) throw fail("claim.input", "DOCUMENT_ID_MISSING");

    async function readAV(stage: string) {
        let database: any;
        try { database = await getAttributeView(avID); }
        catch { throw fail(stage, "AV_READ_FAILED"); }
        if (!Array.isArray(database?.av?.keyValues)) throw fail(stage, "AV_READ_INVALID");
        assertNoWereadOrphanIdentityConflict(plugin, database.av.keyValues, { bookID, isbn });
        return database;
    }
    function checkMatch(match: BookIdentityMatch, stage: string, allowClaimed = false): BookIdentityRow {
        if (match.issue) throw fail(stage, "IDENTITY_" + match.issue.toUpperCase());
        const row = match.row;
        if (!row) throw fail(stage, "ISBN_MATCH_MISSING");
        if (row.bookID && (!allowClaimed || row.bookID !== bookID)) throw fail(stage, "BOOKID_ALREADY_SET", row);
        if (match.matchType !== "ISBN" && !(allowClaimed && match.matchType === "bookID" && row.bookID === bookID)) throw fail(stage, "ISBN_MATCH_MISSING", row);
        if (row.rowBlockID !== expectedRow.rowBlockID) throw fail(stage, "ROW_ID_CHANGED", row);
        if (row.docBlockID !== expectedRow.docBlockID) throw fail(stage, "DOCUMENT_ID_CHANGED", row);
        if (row.isbn !== expectedRow.isbn || row.isbn !== isbn) throw fail(stage, "ISBN_MISMATCH", row);
        if (row.title !== expectedRow.title) throw fail(stage, "TITLE_CHANGED", row);
        return row;
    }

    let database: any;
    for (const [attempt, delay] of WEREAD_IDENTITY_READBACK_DELAYS.entries()) {
        if (delay) await new Promise(resolve => setTimeout(resolve, delay));
        database = await readAV("claim.preflight");
        const history = await loadWereadSyncedNotebooks(plugin);
        const row = checkMatch(matchWereadBookIdentity(buildBookIdentityRows(database.av.keyValues), { bookID, isbn }, history, false), "claim.preflight");
        const binding = getNoteDocumentBinding(row.docBlockID, await validateNoteDocumentBindings([row.docBlockID]));
        if (binding.state === "bound") break;
        if (binding.state !== "missing") throw fail("claim.document", "DOCUMENT_BINDING_INVALID", row);
        if (attempt === WEREAD_IDENTITY_READBACK_DELAYS.length - 1) throw fail("claim.document", "DOCUMENT_INDEX_NOT_VISIBLE", row, { attempts: attempt + 1, documentBound: false });
    }
    if (options && !database.av.keyValues.some((kv: any) => kv.key?.name === "bookID" && kv.key.id === options.existingColumnID && kv.key.type === "text")) throw fail("claim.before_write", "BOOKID_COLUMN_CHANGED");
    let claimColumnID = options?.existingColumnID || "";
    if (!database.av.keyValues.some((kv: any) => kv.key?.name === "bookID")) {
        // Add only the identity column; preserve the primary key and all user metadata.
        claimColumnID = generateUniqueBlocked();
        try {
            await addAttributeViewKeyStrict({
                avID, keyID: claimColumnID, keyName: "bookID", keyType: "text", keyIcon: "",
                previousKeyID: database.av.keyValues.at(-1)?.key?.id || "",
            });
        } catch { throw fail("claim.column", "BOOKID_COLUMN_WRITE_FAILED"); }
    }

    async function readClaimState(stage: string, allowClaimed = false) {
        const keyValues = (await readAV(stage)).av.keyValues;
        const rows = buildBookIdentityRows(keyValues);
        const history = await loadWereadSyncedNotebooks(plugin);
        const current = checkMatch(matchWereadBookIdentity(rows, { bookID, isbn }, history, false), stage, allowClaimed);
        const columns = keyValues.filter((kv: any) => kv.key?.name === "bookID");
        const column = columns[0];
        if (rows.filter(row => row.rowBlockID === expectedRow.rowBlockID).length !== 1) throw fail(stage, "ROW_ID_AMBIGUOUS", current);
        if (!allowClaimed && rows.some(row => row.bookID === bookID)) throw fail(stage, "BOOKID_ALREADY_SET", current);
        if (findConflictingWereadDocBindings(history).has(current.docBlockID)) throw fail(stage, "SHARED_DOCUMENT_CONFLICT", current);
        if (columns.length > 1 || (column && (!column.key?.id || column.key.type !== "text" || (column.values != null && !Array.isArray(column.values))))) throw fail(stage, "BOOKID_COLUMN_INVALID", current, { columns: columns.length });
        if (column && claimColumnID && column.key.id !== claimColumnID) throw fail(stage, "BOOKID_COLUMN_CHANGED", current);
        const cells = (column?.values || []).filter((v: any) => String(v.blockID || v.itemID || "").trim() === expectedRow.rowBlockID);
        if (cells.length > 1 || cells.some((cell: any) => {
            const value = getAttributeViewValueText(cell);
            return value && (!allowClaimed || value !== bookID);
        }) || column?.values?.some((cell: any) => getAttributeViewValueText(cell) === bookID && String(cell.blockID || cell.itemID || "").trim() !== current.rowBlockID)) throw fail(stage, "BOOKID_CELL_CONFLICT", current, { cells: cells.length });
        const binding = getNoteDocumentBinding(current.docBlockID, await validateNoteDocumentBindings([current.docBlockID]));
        if (binding.state !== "bound") throw fail(stage, "DOCUMENT_BINDING_INVALID", current);
        return { current, column, cells };
    }

    // Retry only visibility of this successful column creation; never submit the creation twice.
    const createdColumn = !!claimColumnID && !options;
    let beforeWrite: Awaited<ReturnType<typeof readClaimState>>;
    for (const [attempt, delay] of WEREAD_IDENTITY_READBACK_DELAYS.entries()) {
        if (delay) await new Promise(resolve => setTimeout(resolve, delay));
        beforeWrite = await readClaimState(createdColumn ? "claim.column_readback" : "claim.before_write");
        if (beforeWrite.column) break;
        if (!createdColumn) throw fail("claim.before_write", "BOOKID_COLUMN_INVALID", beforeWrite.current);
        if (attempt === WEREAD_IDENTITY_READBACK_DELAYS.length - 1) throw fail("claim.column_readback", "BOOKID_COLUMN_NOT_VISIBLE", beforeWrite.current, { attempts: attempt + 1 });
    }
    const { current, column, cells } = beforeWrite!;
    claimColumnID = column.key.id;

    // Manual identity repair revalidates source history and AV binding at the write boundary.
    if (options) await options.beforeWrite();
    try {
        await setAttributeViewBlockAttrStrict({
            avID,
            keyID: column.key.id,
            itemID: current.rowBlockID,
            ...(cells[0]?.id ? { cellID: cells[0].id } : {}),
            value: { text: { content: bookID } },
        });
    } catch { throw fail("claim.write", "CLAIM_WRITE_FAILED", current); }
    await reloadAttributeView(avID);
    for (const [attempt, delay] of WEREAD_IDENTITY_READBACK_DELAYS.entries()) {
        if (delay) await new Promise(resolve => setTimeout(resolve, delay));
        const verified = await readClaimState("claim.readback", true);
        if (verified.column && verified.current.bookID === bookID) return;
        if (attempt === WEREAD_IDENTITY_READBACK_DELAYS.length - 1) {
            throw wereadBookIdentityError(t(plugin, "bookUpdateVerificationFailed", "回读验证未通过"), "claim.readback", "CLAIM_READBACK_FAILED", { ...current, bookID }, verified.current, { attempts: attempt + 1, columnPresent: !!verified.column });
        }
    }
}

export function assertNoWereadOrphanIdentityConflict(plugin: any, keyValues: any[], target: BookIdentityTarget): void {
    const bookID = String(target.bookID || "").trim();
    const isbn = normalizeISBN(target.isbn);
    const rows = buildBookIdentityRows(keyValues);
    const rowIDs = new Set(rows.map(row => row.rowBlockID));
    for (const column of keyValues.filter((kv: any) => kv.key?.name === "ISBN" || kv.key?.name === "bookID")) {
        const conflictingOrphan = (column.values || []).some((cell: any) => {
            if (rowIDs.has(String(cell.blockID || cell.itemID || "").trim())) return false;
            const value = getAttributeViewValueText(cell);
            return column.key.name === "bookID" ? value === bookID : isValidISBN(value) && normalizeISBN(value) === isbn;
        });
        if (conflictingOrphan) throw new Error(t(plugin, "wereadIdentityOrphanConflict", "存在与当前 {identifier} 相同的孤立字段，已停止导入；请检查数据库主键与身份字段。", { identifier: column.key.name }));
    }
}

/** Inspect identity without requiring a note document; repair is an explicit import step. */
export async function inspectWereadISBNSourceToDatabase(
    plugin: any,
    avID: string,
    target: { bookID: string; isbn: string },
    expectedRowBlockID?: string,
): Promise<BookIdentityRow | null> {
    const bookID = String(target.bookID || "").trim();
    const isbn = normalizeISBN(target.isbn);
    const changed = t(plugin, "bookUpdateStateChanged", "本地书籍状态已发生变化，请重新搜索后再试。");
    const fail = (reason: string, row?: BookIdentityRow) => wereadBookIdentityError(changed, "isbn.inspect", reason, undefined, row);
    if (!bookID || !isValidISBN(isbn)) throw fail("INVALID_SOURCE_ID");
    let database: any;
    try { database = await getAttributeView(avID); }
    catch { throw fail("AV_READ_FAILED"); }
    if (!Array.isArray(database?.av?.keyValues)) throw fail("AV_READ_INVALID");
    const keyValues = database.av.keyValues;
    const rows = buildBookIdentityRows(keyValues);
    assertNoWereadOrphanIdentityConflict(plugin, keyValues, { bookID, isbn });
    const match = matchWereadBookIdentity(rows, { bookID, isbn }, await loadWereadSyncedNotebooks(plugin), false);
    if (match.issue) throw wereadBookIdentityError(bookIdentityFailureMessage(plugin, match), "isbn.inspect", "IDENTITY_" + match.issue.toUpperCase());
    if (!match.row) {
        if (expectedRowBlockID) throw fail("ISBN_MATCH_MISSING");
        return null;
    }
    if (match.row.isbn !== isbn) throw fail("ISBN_MISMATCH", match.row);
    if (expectedRowBlockID && match.row.rowBlockID !== expectedRowBlockID) throw fail("ROW_ID_CHANGED", match.row);
    return match.row;
}

/** An inserted row must still match its exact returned ID before claim. */
export async function linkWereadISBNSourceToDatabase(
    plugin: any,
    avID: string,
    target: { bookID: string; isbn: string },
    expectedRowBlockID?: string,
): Promise<"linked_existing" | "already_linked" | null> {
    const row = await inspectWereadISBNSourceToDatabase(plugin, avID, target, expectedRowBlockID);
    if (!row) return null;
    if (!row.bookID) {
        await claimWereadBookIDOnExistingRow(plugin, avID, row, target);
        return "linked_existing";
    }
    const bindings = await validateNoteDocumentBindings([row.docBlockID]);
    if (getNoteDocumentBinding(row.docBlockID, bindings).state !== "bound") throw wereadBookIdentityError(t(plugin, "bookUpdateStateChanged", "本地书籍状态已发生变化，请重新搜索后再试。"), "isbn.link", "DOCUMENT_BINDING_INVALID", row);
    return "already_linked";
}
