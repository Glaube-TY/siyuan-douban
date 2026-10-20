import type { BookIdentityRow } from "../../bookHandling/bookDeduplication";

// Real SiYuan SQL document/attribute indexes can lag successful AV and document writes.
export const WEREAD_IDENTITY_READBACK_DELAYS = [0, 80, 160, 320, 640, 1280, 1280];

export const WEREAD_IDENTITY_STAGES: ReadonlySet<string> = new Set([
    "isbn.inspect", "isbn.link",
    "claim.input", "claim.preflight", "claim.document", "claim.column", "claim.column_readback", "claim.before_write", "claim.write", "claim.readback",
    "note.input", "note.repair", "note.before_create", "note.create", "note.document", "note.readback",
]);

export interface WereadBookIdentityFailure {
    stage: string;
    reasonCode: string;
}

/** Copy only validated data properties; never inspect message, stack or diagnostic snapshots. */
export function extractWereadBookIdentityFailure(error: unknown): WereadBookIdentityFailure | null {
    if (!(error instanceof Error)) return null;
    const stage = Object.getOwnPropertyDescriptor(error, "stage")?.value;
    const reasonCode = Object.getOwnPropertyDescriptor(error, "reasonCode")?.value;
    if (typeof stage !== "string" || !WEREAD_IDENTITY_STAGES.has(stage)
        || typeof reasonCode !== "string" || !/^[A-Z][A-Z0-9_]{0,63}$/.test(reasonCode)) return null;
    return { stage, reasonCode };
}

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
