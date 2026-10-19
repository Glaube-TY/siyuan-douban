import type { BookIdentityRow } from "../../bookHandling/bookDeduplication";

// Real SiYuan SQL document/attribute indexes can lag successful AV and document writes.
export const WEREAD_IDENTITY_READBACK_DELAYS = [0, 80, 160, 320, 640, 1280, 1280];

export function wereadBookIdentityError(
    message: string,
    stage: string,
    reasonCode: string,
    expected?: BookIdentityRow,
    actual?: BookIdentityRow,
    counts: Record<string, number | boolean> = {},
): Error & { reasonCode: string; stage: string } {
    const mask = (value: string) => value ? `${value.length}:…${value.length > 4 ? value.slice(-3) : "***"}` : "";
    const snapshot = (row?: BookIdentityRow) => row && ({
        rowID: mask(row.rowBlockID), documentID: mask(row.docBlockID),
        isbn: mask(row.isbn), bookID: mask(row.bookID),
    });
    const diagnostic = {
        stage, reasonCode, expected: snapshot(expected), actual: snapshot(actual),
        ...(expected && actual ? {
            rowIDMatches: expected.rowBlockID === actual.rowBlockID,
            documentIDMatches: expected.docBlockID === actual.docBlockID,
            isbnMatches: expected.isbn === actual.isbn,
            bookIDMatches: expected.bookID === actual.bookID,
            titleMatches: expected.title === actual.title,
        } : {}), ...counts,
    };
    console.warn("[weread/book-identity]", diagnostic);
    return Object.assign(new Error(`${message} [${stage}/${reasonCode}]`), { reasonCode, stage, diagnostic });
}
