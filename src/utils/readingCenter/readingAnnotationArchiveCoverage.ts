import type { ReadingAnnotationArchive } from "../../types/readingAnnotation";

export interface ReadingAnnotationArchiveCoverage {
    expectedSourceKeys: Set<string>;
    archivedSourceCount: number;
    archiveMissing: boolean;
    archiveIncomplete: boolean;
}

export function getReadingAnnotationArchiveCoverage(
    archive: ReadingAnnotationArchive,
    archiveExists: boolean,
    syncedRecords: unknown[],
    ignoredBookIDs: Set<string>,
    additionalSourceKeys: Iterable<string> = [],
): ReadingAnnotationArchiveCoverage {
    const expectedSourceKeys = buildExpectedSourceKeys(syncedRecords, ignoredBookIDs);
    for (const sourceKey of additionalSourceKeys) {
        if (typeof sourceKey === "string" && sourceKey.trim()) expectedSourceKeys.add(sourceKey.trim());
    }

    const archivedSourceCount = Array.from(expectedSourceKeys)
        .filter((sourceKey) => !!archive.sources[sourceKey]).length;

    return {
        expectedSourceKeys,
        archivedSourceCount,
        archiveMissing: !archiveExists && expectedSourceKeys.size > 0,
        archiveIncomplete: expectedSourceKeys.size > 0 && archivedSourceCount < expectedSourceKeys.size,
    };
}

export function buildExpectedSourceKeys(records: unknown[], ignoredBookIDs: Set<string>): Set<string> {
    const sourceKeys = new Set<string>();
    for (const record of Array.isArray(records) ? records : []) {
        const value = record && typeof record === "object" ? record as Record<string, unknown> : {};
        const bookID = String(value.bookID || value.bookId || value.syncID || "").trim();
        if (!bookID || ignoredBookIDs.has(bookID)) continue;
        const sourceType = String(value.sourceType || "");
        const isMp = sourceType === "weread_mp_account"
            || sourceType === "weread-mp"
            || /^MP(?:_|$)/.test(bookID);
        sourceKeys.add(`${isMp ? "weread-mp" : "weread-book"}:${bookID}`);
    }
    return sourceKeys;
}
