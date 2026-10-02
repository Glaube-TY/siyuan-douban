import { matchBookIdentity, type BookIdentityMatch, type BookIdentityRow, type BookIdentityTarget } from "../../bookHandling/bookDeduplication";
import { findConflictingWereadDocBindings, getWereadStorageKey } from "../wereadSyncStorage";
import { t } from "../../i18n";

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
