export const BOOK_TITLE_KEY_NAME = "书名";

export function findBookPrimaryKey(databaseKeys: any[] | null | undefined): any | undefined {
    if (!Array.isArray(databaseKeys)) return undefined;
    return databaseKeys.find((key: any) => key?.type === "block")
        || databaseKeys.find((key: any) => key?.name === BOOK_TITLE_KEY_NAME);
}

export function findBookPrimaryKeyValue(keyValues: any[] | null | undefined): any | undefined {
    if (!Array.isArray(keyValues)) return undefined;
    return keyValues.find((keyValue: any) => keyValue?.key?.type === "block")
        || keyValues.find((keyValue: any) => keyValue?.key?.name === BOOK_TITLE_KEY_NAME);
}
