import { findBookPrimaryKeyValue } from "./bookDatabasePrimaryKey";
import { isValidISBN, normalizeISBN } from "./isbn";

export function normalizeBookTitle(value: unknown): string {
    return String(value || "")
        .normalize("NFKC")
        .trim()
        .replace(/^《(.+)》$/u, "$1")
        .replace(/\s+/g, " ")
        .toLowerCase();
}

export function getAttributeViewValueText(value: any): string {
    return String(
        value?.block?.content
        ?? value?.text?.content
        ?? value?.number?.formattedContent
        ?? value?.number?.content
        ?? ""
    ).trim();
}

export function findBookByNormalizedTitle(keyValues: any[], title: unknown): any | null {
    const match = matchBookIdentity(buildBookIdentityRows(keyValues), { title });
    return !match.issue ? match.row?.titleValue || null : null;
}

export interface BookIdentityRow {
    rowBlockID: string;
    docBlockID: string;
    title: string;
    normalizedTitle: string;
    isbn: string;
    bookID: string;
    titleValue: any;
}

export interface BookIdentityTarget {
    bookID?: string;
    isbn?: string;
    title?: unknown;
}

export interface BookIdentityMatch {
    row?: BookIdentityRow;
    matchType?: "bookID" | "ISBN" | "title";
    issue?: "ambiguous" | "bookID_conflict" | "isbn_conflict" | "shared_doc";
}

/** Join AV columns by row ID, never by title. Only block.id is a document candidate. */
export function buildBookIdentityRows(keyValues: any[]): BookIdentityRow[] {
    const titleValues = findBookPrimaryKeyValue(keyValues)?.values || [];
    const column = (name: string) => new Map<string, string>(
        (keyValues.find((kv: any) => kv.key?.name === name)?.values || [])
            .map((value: any) => [String(value.blockID || value.itemID || "").trim(), getAttributeViewValueText(value)]),
    );
    const isbns = column("ISBN");
    const bookIDs = column("bookID");
    return titleValues.map((value: any) => {
        const rowBlockID = String(value.blockID || value.itemID || "").trim();
        const title = getAttributeViewValueText(value);
        return {
            rowBlockID,
            docBlockID: String(value.block?.id || "").trim(),
            title,
            normalizedTitle: normalizeBookTitle(title),
            isbn: normalizeISBN(isbns.get(rowBlockID)),
            bookID: bookIDs.get(rowBlockID) || "",
            titleValue: value,
        };
    }).filter((row: BookIdentityRow) => row.rowBlockID);
}

/** Strong identity first; inserted titles are not source identities. */
export function matchBookIdentity(
    rows: BookIdentityRow[],
    target: BookIdentityTarget,
    allowTitle = true,
): BookIdentityMatch {
    const bookID = String(target.bookID || "").trim();
    const isbn = normalizeISBN(target.isbn);
    const title = normalizeBookTitle(target.title);
    const choose = (candidates: BookIdentityRow[], matchType: BookIdentityMatch["matchType"]): BookIdentityMatch => {
        if (candidates.length > 1) return { matchType, issue: "ambiguous" };
        const row = candidates[0];
        if (row.bookID && row.bookID !== bookID) return { matchType, issue: "bookID_conflict" };
        if (matchType === "title" && isValidISBN(isbn) && isValidISBN(row.isbn) && row.isbn !== isbn) {
            return { matchType, issue: "isbn_conflict" };
        }
        if (bookID && row.docBlockID && rows.some(other => (
            other.docBlockID === row.docBlockID && other.bookID && other.bookID !== bookID
        ))) return { matchType, issue: "shared_doc" };
        return { row, matchType };
    };
    const exact = bookID ? rows.filter(row => row.bookID === bookID) : [];
    if (exact.length) return choose(exact, "bookID");
    const byISBN = isValidISBN(isbn) ? rows.filter(row => row.isbn === isbn) : [];
    if (byISBN.length) return choose(byISBN, "ISBN");
    const byTitle = allowTitle && title ? rows.filter(row => row.normalizedTitle === title) : [];
    return byTitle.length ? choose(byTitle, "title") : {};
}
