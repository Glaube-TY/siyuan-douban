import { sql, getAttributeView } from "@/api";
import { buildBookIdentityRows } from "../bookHandling/bookDeduplication";
import { findBookPrimaryKeyValue } from "../bookHandling/bookDatabasePrimaryKey";
import { isValidISBN, normalizeISBN } from "../bookHandling/isbn";
import { loadPluginStorageJsonStateStrict } from "../storage/pluginStorageStrict";

/** Always read-only; the old options argument is retained for existing callers. */
export async function getCurrentValidBookIdentifiers(plugin: any, _options?: { cleanupOrphans?: boolean }): Promise<{
    validISBNs: Set<string>;
    validBookIDs: Set<string>;
    validBookNames: Set<string>;
}> {
    const validID = (value: unknown) => typeof value === "string" && /^\d{14}-[a-z0-9]{7}$/.test(value);
    const object = (value: any) => value !== null && typeof value === "object" && !Array.isArray(value);
    function check(condition: unknown, reason: string): asserts condition {
        if (!condition) throw new Error("WEREAD_MANAGEMENT_" + reason);
    }
    const settings = await loadPluginStorageJsonStateStrict(plugin, "settings.json");
    check(settings.exists && object(settings.value), "SETTINGS_INVALID");
    const blockID = (settings.value as any).bookDatabaseID;
    check(validID(blockID), "DATABASE_ID_INVALID");
    const blocks = await sql(`SELECT id, markdown FROM blocks WHERE id = '${blockID}'`);
    check(Array.isArray(blocks) && blocks.length === 1 && blocks[0]?.id === blockID && typeof blocks[0].markdown === "string", "DATABASE_BLOCK_INVALID");
    const avID = blocks[0].markdown.match(/data-av-id="([^"]+)"/)?.[1];
    check(validID(avID), "AV_ID_INVALID");
    const database = await getAttributeView(avID);
    const columns = database?.av?.keyValues;
    check(Array.isArray(columns) && columns.every(column => object(column) && object(column.key)), "AV_INVALID");
    const primary = findBookPrimaryKeyValue(columns);
    check(primary?.key.type === "block" && validID(primary.key.id) && columns.filter(column => column.key.type === "block").length === 1, "PRIMARY_KEY_INVALID");
    for (const name of ["ISBN", "bookID"]) check(columns.filter(column => column.key.name === name).length <= 1, "IDENTITY_COLUMN_INVALID");
    for (const column of columns.filter(column => column === primary || ["ISBN", "bookID"].includes(column.key.name))) {
        check(validID(column.key.id) && Array.isArray(column.values), "COLUMN_VALUES_INVALID");
        if (column !== primary) check(column.key.name === "bookID" ? column.key.type === "text" : ["text", "number"].includes(column.key.type), "IDENTITY_COLUMN_INVALID");
        const seen = new Set<string>();
        for (const cell of column.values) {
            check(object(cell) && validID(cell.blockID || cell.itemID), "ROW_ID_INVALID");
            const rowID = cell.blockID || cell.itemID;
            check(!seen.has(rowID), "ROW_ID_AMBIGUOUS"); seen.add(rowID);
            if (column === primary) check(object(cell.block) && typeof cell.block.content === "string", "PRIMARY_VALUE_INVALID");
            else check(object(cell[column.key.type]), "IDENTITY_VALUE_INVALID");
            for (const value of [cell.text?.content, cell.number?.formattedContent, cell.number?.content]) {
                check(value == null || typeof value === "string" || (typeof value === "number" && Number.isFinite(value)), "IDENTITY_VALUE_INVALID");
            }
        }
    }
    // The shared helper joins by primary row ID; orphan cells are left on disk and excluded in memory.
    const rows = buildBookIdentityRows(columns);
    return {
        validISBNs: new Set(rows.map(row => row.isbn).filter(isValidISBN).map(normalizeISBN)),
        validBookIDs: new Set(rows.map(row => row.bookID).filter(Boolean)),
        validBookNames: new Set(rows.map(row => row.title).filter(Boolean)),
    };
}
