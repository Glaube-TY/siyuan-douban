import { buildBookIdentityRows, getAttributeViewValueText, matchBookIdentity, type BookIdentityMatch, type BookIdentityRow, type BookIdentityTarget } from "../../bookHandling/bookDeduplication";
import { findConflictingWereadDocBindings, getWereadStorageKey, loadWereadSyncedNotebooks } from "../wereadSyncStorage";
import { t } from "../../i18n";
import { addAttributeViewKey, getAttributeView, reloadAttributeView, setAttributeViewBlockAttrStrict } from "@/api";
import { isValidISBN, normalizeISBN } from "../../bookHandling/isbn";
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
): Promise<void> {
    const bookID = String(target.bookID || "").trim();
    const isbn = normalizeISBN(target.isbn);
    const changed = t(plugin, "bookUpdateStateChanged", "本地书籍状态已发生变化，请重新搜索后再试。");
    if (!bookID || !isValidISBN(isbn) || expectedRow.bookID || !expectedRow.docBlockID) throw new Error(changed);

    let database = await getAttributeView(avID);
    if (!Array.isArray(database?.av?.keyValues)) throw new Error(changed);
    const history = await loadWereadSyncedNotebooks(plugin);
    const bindings = await validateNoteDocumentBindings([expectedRow.docBlockID]);
    if (getNoteDocumentBinding(expectedRow.docBlockID, bindings).state !== "bound") throw new Error(changed);
    const initial = matchWereadBookIdentity(buildBookIdentityRows(database.av.keyValues), { bookID, isbn }, history, false);
    if (initial.issue || initial.matchType !== "ISBN" || !initial.row || initial.row.bookID
        || initial.row.rowBlockID !== expectedRow.rowBlockID || initial.row.docBlockID !== expectedRow.docBlockID
        || initial.row.isbn !== expectedRow.isbn || initial.row.title !== expectedRow.title) throw new Error(changed);
    if (!database.av.keyValues.some((kv: any) => kv.key?.name === "bookID")) {
        // Add only the identity column; preserve the primary key and all user metadata.
        await addAttributeViewKey({
            avID, keyID: generateUniqueBlocked(), keyName: "bookID", keyType: "text", keyIcon: "",
            previousKeyID: database.av.keyValues.at(-1)?.key?.id || "",
        });
    }

    // Read again immediately before writing: never overwrite a newly claimed owner.
    database = await getAttributeView(avID);
    if (!Array.isArray(database?.av?.keyValues)) throw new Error(changed);
    const keyValues = database.av.keyValues;
    const rows = buildBookIdentityRows(keyValues);
    const currentHistory = await loadWereadSyncedNotebooks(plugin);
    const match = matchWereadBookIdentity(rows, { bookID, isbn }, currentHistory, false);
    const current = match.row;
    const bookIDColumns = keyValues.filter((kv: any) => kv.key?.name === "bookID");
    const column = bookIDColumns[0];
    const cells = (column?.values || []).filter((v: any) => String(v.blockID || v.itemID || "").trim() === expectedRow.rowBlockID);
    if (match.issue || match.matchType !== "ISBN" || !current || current.bookID
        || current.rowBlockID !== expectedRow.rowBlockID || current.docBlockID !== expectedRow.docBlockID
        || current.isbn !== isbn || current.isbn !== expectedRow.isbn || current.title !== expectedRow.title
        || rows.filter(row => row.rowBlockID === expectedRow.rowBlockID).length !== 1
        || rows.some(row => row.bookID === bookID)
        || findConflictingWereadDocBindings(currentHistory).has(current.docBlockID)
        || bookIDColumns.length !== 1 || !column.key?.id || column.key.type !== "text"
        || cells.length > 1 || cells.some((cell: any) => getAttributeViewValueText(cell))
        || column.values?.some((cell: any) => getAttributeViewValueText(cell) === bookID)) throw new Error(changed);

    await setAttributeViewBlockAttrStrict({
        avID,
        keyID: column.key.id,
        itemID: current.rowBlockID,
        ...(cells[0]?.id ? { cellID: cells[0].id } : {}),
        value: { text: { content: bookID } },
    });
    await reloadAttributeView(avID);
    const refreshed = await getAttributeView(avID);
    if (!Array.isArray(refreshed?.av?.keyValues)) throw new Error(changed);
    const verifiedRows = buildBookIdentityRows(refreshed.av.keyValues);
    const verified = verifiedRows.filter(row => row.rowBlockID === current.rowBlockID);
    if (verified.length !== 1 || verified[0].bookID !== bookID || verified[0].docBlockID !== current.docBlockID
        || verified[0].isbn !== isbn || verifiedRows.filter(row => row.bookID === bookID).length !== 1) {
        throw new Error(t(plugin, "bookUpdateVerificationFailed", "回读验证未通过"));
    }
}
