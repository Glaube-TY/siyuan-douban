import { sql, getAttributeView, removeAttributeViewBlocks } from "@/api";

export async function getCurrentValidBookIdentifiers(plugin: any): Promise<{
    validISBNs: Set<string>;
    validBookIDs: Set<string>;
    validBookNames: Set<string>;
}> {
    const settings = (await plugin.loadData("settings.json")) || {};
    const blockID = settings?.bookDatabaseID || "";
    if (!blockID) {
        return {
            validISBNs: new Set<string>(),
            validBookIDs: new Set<string>(),
            validBookNames: new Set<string>(),
        };
    }

    let avID = "";
    try {
        const blockResult = await sql(`SELECT * FROM blocks WHERE id = "${blockID}"`);
        avID = blockResult?.[0]?.markdown?.match(/data-av-id="([^"]+)"/)?.[1] || "";
    } catch {
        avID = "";
    }
    if (!avID) {
        return {
            validISBNs: new Set<string>(),
            validBookIDs: new Set<string>(),
            validBookNames: new Set<string>(),
        };
    }

    try {
        let database = await getAttributeView(avID);
        let avData = database?.av || {};
        let keyValues: any[] = avData.keyValues || [];

        const isbnKey = keyValues.find((item: any) => item.key?.name === "ISBN");
        const bookIDKey = keyValues.find((item: any) => item.key?.name === "bookID");
        const bookNameKey = keyValues.find((item: any) => item.key?.name === "书名");

        let ISBNColumn = isbnKey?.values || [];
        let bookIDColumn = bookIDKey?.values || [];
        let bookNameColumn = bookNameKey?.values || [];

        const bookNameBlockIDs = new Set<string>(bookNameColumn.map((item: any) => item.blockID));
        const isbnBlockIDs = new Set<string>(ISBNColumn.map((item: any) => item.blockID));
        const bookIDBlockIDs = new Set<string>(bookIDColumn.map((item: any) => item.blockID));
        const blockIDsToRemove = Array.from(
            new Set<string>([
                ...[...isbnBlockIDs].filter((id) => !bookNameBlockIDs.has(id)),
                ...[...bookIDBlockIDs].filter((id) => !bookNameBlockIDs.has(id)),
            ]),
        );

        if (blockIDsToRemove.length > 0) {
            await removeAttributeViewBlocks(avID, blockIDsToRemove);
            database = await getAttributeView(avID);
            avData = database?.av || {};
            keyValues = avData.keyValues || [];

            const updatedISBNKey = keyValues.find((item: any) => item.key?.name === "ISBN");
            const updatedBookIDKey = keyValues.find((item: any) => item.key?.name === "bookID");
            const updatedBookNameKey = keyValues.find((item: any) => item.key?.name === "书名");
            ISBNColumn = updatedISBNKey?.values || [];
            bookIDColumn = updatedBookIDKey?.values || [];
            bookNameColumn = updatedBookNameKey?.values || [];
        }

        const validISBNs = new Set<string>(
            ISBNColumn.map((item: any) => item.number?.content?.toString()).filter(
                (v): v is string => !!v,
            ),
        );
        const validBookIDs = new Set<string>(
            bookIDColumn.map((item: any) => item.text?.content?.toString()).filter(
                (v): v is string => !!v,
            ),
        );
        const validBookNames = new Set<string>(
            bookNameColumn
                .map((item: any) => item.text?.content?.toString().trim())
                .filter((v): v is string => !!v),
        );

        return { validISBNs, validBookIDs, validBookNames };
    } catch {
        return {
            validISBNs: new Set<string>(),
            validBookIDs: new Set<string>(),
            validBookNames: new Set<string>(),
        };
    }
}
