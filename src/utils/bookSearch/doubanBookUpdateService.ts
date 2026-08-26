import { getAttributeView, reloadAttributeView, setAttributeViewBlockAttrStrict } from "@/api";
import { downloadCover, getImage } from "../core/getImg";
import { parseDateToTimestamp } from "../core/formatOp";
import { getAttributeViewValueText } from "../bookHandling/bookDeduplication";
import { findBookPrimaryKeyValue } from "../bookHandling/bookDatabasePrimaryKey";
import { loadDatabaseSettings } from "../settings/databaseSettingsService";
import { t } from "../i18n";

type PluginLike = {
    loadData: (key: string) => Promise<any>;
    saveData: (key: string, value: any) => Promise<void>;
    i18n?: Record<string, unknown>;
};

type CellContent = string | number | null | undefined;

type AttributeViewCell = {
    id?: string;
    blockID?: string;
    block?: { content?: CellContent };
    text?: { content?: CellContent };
    number?: { formattedContent?: CellContent; content?: CellContent };
    date?: { content?: CellContent };
    mAsset?: Array<{ content?: CellContent }>;
};

type AttributeViewKeyValue = {
    key?: { id?: string; name?: string; type?: string };
    values?: AttributeViewCell[];
};

type DoubanFieldValueType = "block" | "text" | "number" | "date" | "mAsset";

type DoubanFieldDefinition = {
    fieldName: string;
    sourceKey: string;
    valueType: DoubanFieldValueType;
    labelKey: string;
    fallback: string;
};

type PreparedFieldValue = {
    compareValue: string | number;
    newValue: string | number;
    payload: Record<string, unknown>;
};

type PendingField = {
    definition: DoubanFieldDefinition;
    keyID: string;
    cellID?: string;
    newValue: string | number;
    payload: Record<string, unknown>;
};

export type DoubanLocalBookMatchStatus = "none" | "matched" | "ambiguous";

export interface DoubanLocalBookMatch {
    status: DoubanLocalBookMatchStatus;
    avID?: string;
    blockID?: string;
    isbn?: string;
    localTitle?: string;
}

export interface DoubanBookUpdateFailure {
    fieldName: string;
    error: string;
}

export interface DoubanBookUpdateResult {
    code: number;
    msg: string;
    updatedFields: string[];
    failedFields: DoubanBookUpdateFailure[];
    unchangedFields: string[];
    skippedMissingFields: string[];
    skippedEmptyFields: string[];
}

const DOUBAN_FIELDS: readonly DoubanFieldDefinition[] = [
    { fieldName: "书名", sourceKey: "title", valueType: "block", labelKey: "bookTitle", fallback: "书名" },
    { fieldName: "副标题", sourceKey: "subtitle", valueType: "text", labelKey: "bookSubtitle", fallback: "副标题" },
    { fieldName: "原作名", sourceKey: "originalTitle", valueType: "text", labelKey: "bookOriginalTitle", fallback: "原作名" },
    { fieldName: "作者", sourceKey: "authors", valueType: "text", labelKey: "bookAuthor", fallback: "作者" },
    { fieldName: "译者", sourceKey: "translators", valueType: "text", labelKey: "bookTranslator", fallback: "译者" },
    { fieldName: "出版社", sourceKey: "publisher", valueType: "text", labelKey: "bookPublisher", fallback: "出版社" },
    { fieldName: "出版年", sourceKey: "publishDate", valueType: "date", labelKey: "bookPublishYear", fallback: "出版年" },
    { fieldName: "出品方", sourceKey: "producer", valueType: "text", labelKey: "bookProducer", fallback: "出品方" },
    { fieldName: "丛书", sourceKey: "series", valueType: "text", labelKey: "bookSeries", fallback: "丛书" },
    { fieldName: "ISBN", sourceKey: "isbn", valueType: "number", labelKey: "bookIsbn1", fallback: "ISBN" },
    { fieldName: "豆瓣评分", sourceKey: "rating", valueType: "number", labelKey: "bookDoubanRating", fallback: "豆瓣评分" },
    { fieldName: "评分人数", sourceKey: "ratingCount", valueType: "number", labelKey: "bookRatingCount", fallback: "评分人数" },
    { fieldName: "定价", sourceKey: "price", valueType: "number", labelKey: "bookPrice", fallback: "定价" },
    { fieldName: "页数", sourceKey: "pages", valueType: "number", labelKey: "bookPages", fallback: "页数" },
    { fieldName: "装帧", sourceKey: "binding", valueType: "text", labelKey: "bookBinding", fallback: "装帧" },
    { fieldName: "书籍简介", sourceKey: "description", valueType: "text", labelKey: "bookDescription", fallback: "书籍简介" },
    { fieldName: "作者介绍", sourceKey: "authorBio", valueType: "text", labelKey: "bookAuthorBio", fallback: "作者介绍" },
];

const COVER_FIELD: DoubanFieldDefinition = {
    fieldName: "封面",
    sourceKey: "cover",
    valueType: "mAsset",
    labelKey: "bookCover",
    fallback: "封面",
};

function tx(plugin: PluginLike, key: string, fallback: string, params: Record<string, string | number> = {}): string {
    return t(plugin, key, fallback, params);
}

export function normalizeISBN(value: unknown): string {
    return String(value ?? "").toUpperCase().replace(/[^0-9X]/g, "");
}

function isValidISBN(value: string): boolean {
    return /^(?:97[89])?\d{9}[\dX]$/.test(value);
}

function hasMeaningfulValue(value: unknown): boolean {
    if (value === null || value === undefined) return false;
    if (Array.isArray(value)) return value.some((item) => hasMeaningfulValue(item));
    if (typeof value === "number") return Number.isFinite(value);
    return String(value).trim().length > 0;
}

function readNumberCellValue(cell: AttributeViewCell | undefined): CellContent {
    const formatted = cell?.number?.formattedContent;
    if (hasMeaningfulValue(formatted)) return formatted;
    return cell?.number?.content ?? "";
}

function readCellValue(cell: AttributeViewCell | undefined, valueType: string): unknown {
    if (!cell) return "";
    if (valueType === "block") return cell.block?.content ?? "";
    if (valueType === "text") return cell.text?.content ?? "";
    if (valueType === "number") return readNumberCellValue(cell);
    if (valueType === "date") return cell.date?.content ?? "";
    if (valueType === "mAsset") return cell.mAsset?.[0]?.content ?? "";
    return "";
}

function findCell(keyValue: AttributeViewKeyValue | undefined, blockID: string): AttributeViewCell | undefined {
    return keyValue?.values?.find((value) => String(value.blockID || "").trim() === blockID);
}

function getKeyName(keyValue: AttributeViewKeyValue): string {
    return String(keyValue.key?.name || "").trim();
}

function getSourceValue(bookInfo: Record<string, unknown>, definition: DoubanFieldDefinition): unknown {
    const value = bookInfo[definition.sourceKey];
    if (Array.isArray(value)) return value.filter(Boolean).join(", ");
    if (typeof value === "string") return value.trim();
    return value;
}

function parseNumberValue(value: unknown): number | null {
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    const text = String(value ?? "").trim().replace(/,/g, "");
    if (!text) return null;
    const number = Number(text);
    return Number.isFinite(number) ? number : null;
}

function parseDateValue(value: unknown): number {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    const text = String(value ?? "").trim();
    if (!text) return 0;
    if (/^\d{5,}$/.test(text)) {
        const timestamp = Number(text);
        if (Number.isFinite(timestamp)) return timestamp;
    }
    const timestamp = parseDateToTimestamp(text);
    if (timestamp) return timestamp;
    const nativeTimestamp = Date.parse(text);
    return Number.isFinite(nativeTimestamp) ? nativeTimestamp : 0;
}

function prepareFieldValue(
    definition: DoubanFieldDefinition,
    sourceValue: unknown,
): PreparedFieldValue | null {
    if (definition.valueType === "block" || definition.valueType === "text") {
        const content = String(sourceValue ?? "").trim();
        if (!content) return null;
        return {
            compareValue: content,
            newValue: content,
            payload: definition.valueType === "block"
                ? { block: { content } }
                : { text: { content } },
        };
    }

    if (definition.valueType === "number") {
        const numericValue = parseNumberValue(sourceValue);
        if (numericValue === null) return null;
        const formattedContent = definition.fieldName === "ISBN"
            ? normalizeISBN(sourceValue)
            : String(sourceValue ?? "").trim();
        if (!formattedContent) return null;
        return {
            compareValue: definition.fieldName === "ISBN" ? formattedContent : numericValue,
            newValue: numericValue,
            payload: {
                number: {
                    content: numericValue,
                    formattedContent,
                    isNotEmpty: true,
                },
            },
        };
    }

    if (definition.valueType === "mAsset") return null;

    const timestamp = parseDateValue(sourceValue);
    if (!timestamp) return null;
    return {
        compareValue: timestamp,
        newValue: timestamp,
        payload: {
            date: {
                content: timestamp,
                isNotEmpty: true,
                isNotTime: true,
            },
        },
    };
}

function valuesEqual(definition: DoubanFieldDefinition, localValue: unknown, prepared: PreparedFieldValue): boolean {
    if (definition.fieldName === "ISBN") {
        return normalizeISBN(localValue) === String(prepared.compareValue);
    }
    if (definition.valueType === "number") {
        return parseNumberValue(localValue) === prepared.compareValue;
    }
    if (definition.valueType === "date") {
        return parseDateValue(localValue) === prepared.compareValue;
    }
    return String(localValue ?? "").trim() === String(prepared.compareValue);
}

async function readKeyValues(avID: string): Promise<AttributeViewKeyValue[]> {
    const database = await getAttributeView(avID);
    const keyValues = database?.av?.keyValues;
    if (!Array.isArray(keyValues)) {
        throw new Error("属性视图数据无效，无法读取本地书籍");
    }
    return keyValues as AttributeViewKeyValue[];
}

function buildLocalMatch(
    avID: string,
    keyValues: AttributeViewKeyValue[],
    normalizedISBN: string,
): DoubanLocalBookMatch {
    const isbnKey = keyValues.find((keyValue) => getKeyName(keyValue) === "ISBN");
    const matchedBlockIDs = Array.from(new Set(
        (isbnKey?.values || [])
            .filter((value) => normalizeISBN(readCellValue(value, "number")) === normalizedISBN)
            .map((value) => String(value.blockID || "").trim())
            .filter(Boolean),
    ));

    if (matchedBlockIDs.length === 0) return { status: "none", avID, isbn: normalizedISBN };
    if (matchedBlockIDs.length > 1) return { status: "ambiguous", avID, isbn: normalizedISBN };

    const blockID = matchedBlockIDs[0];
    const primaryKeyValue = findBookPrimaryKeyValue(keyValues);
    const localTitle = getAttributeViewValueText(findCell(primaryKeyValue, blockID));
    return {
        status: "matched",
        avID,
        blockID,
        isbn: normalizedISBN,
        localTitle,
    };
}

export async function inspectDoubanLocalBookMatch(
    plugin: PluginLike,
    bookInfo: Record<string, unknown>,
): Promise<DoubanLocalBookMatch> {
    const database = await loadDatabaseSettings(plugin);
    if (!database.valid || !database.avID) return { status: "none" };

    const normalizedISBN = normalizeISBN(bookInfo?.isbn);
    if (!isValidISBN(normalizedISBN)) return { status: "none", avID: database.avID };

    const keyValues = await readKeyValues(database.avID);
    const match = buildLocalMatch(database.avID, keyValues, normalizedISBN);
    if (match.status === "matched" && !findBookPrimaryKeyValue(keyValues)) {
        throw new Error(tx(plugin, "bookUpdateMissingPrimaryKey", "本地书籍数据库缺少主键，无法安全更新"));
    }
    return match;
}

function getFieldLabel(plugin: PluginLike, fieldName: string): string {
    const definition = fieldName === COVER_FIELD.fieldName
        ? COVER_FIELD
        : DOUBAN_FIELDS.find((field) => field.fieldName === fieldName);
    return definition ? tx(plugin, definition.labelKey, definition.fallback) : fieldName;
}

function partialFailureMessage(plugin: PluginLike, failures: DoubanBookUpdateFailure[]): string {
    const fields = failures.map((failure) => {
        const label = getFieldLabel(plugin, failure.fieldName);
        return failure.error ? `${label}（${failure.error}）` : label;
    }).join("、");
    return tx(plugin, "bookUpdatePartialFailed", "部分字段更新失败：{fields}", { fields });
}

function buildEmptyUpdateResult(
    plugin: PluginLike,
    skippedMissingFields: string[],
    skippedEmptyFields: string[],
    unchangedFields: string[],
): DoubanBookUpdateResult {
    return {
        code: 0,
        msg: tx(plugin, "bookUpdateNoChanges", "本地字段已是最新，无需更新"),
        updatedFields: [],
        failedFields: [],
        unchangedFields,
        skippedMissingFields,
        skippedEmptyFields,
    };
}

export async function updateEditedDoubanBookInDatabase(
    plugin: PluginLike,
    editedBookInfo: Record<string, unknown>,
    expectedMatch: DoubanLocalBookMatch,
): Promise<DoubanBookUpdateResult> {
    const stateChangedMessage = tx(plugin, "bookUpdateStateChanged", "本地书籍状态已发生变化，请重新搜索后再试。");
    if (expectedMatch?.status !== "matched" || !expectedMatch.avID || !expectedMatch.blockID) {
        throw new Error(stateChangedMessage);
    }

    const database = await loadDatabaseSettings(plugin);
    if (!database.valid || !database.avID) {
        throw new Error(database.message || tx(plugin, "databaseNotConfigured", "未配置本地书籍数据库"));
    }
    if (database.avID !== expectedMatch.avID) throw new Error(stateChangedMessage);

    const normalizedISBN = normalizeISBN(editedBookInfo?.isbn);
    if (!isValidISBN(normalizedISBN)) throw new Error(stateChangedMessage);
    if (normalizedISBN !== normalizeISBN(expectedMatch.isbn)) throw new Error(stateChangedMessage);

    let keyValues = await readKeyValues(database.avID);
    const currentMatch = buildLocalMatch(database.avID, keyValues, normalizedISBN);
    if (
        currentMatch.status !== "matched"
        || currentMatch.blockID !== expectedMatch.blockID
    ) {
        throw new Error(stateChangedMessage);
    }

    const primaryKeyValue = findBookPrimaryKeyValue(keyValues);
    const isbnKey = keyValues.find((keyValue) => getKeyName(keyValue) === "ISBN");
    if (!primaryKeyValue?.key?.id || !isbnKey?.key?.id) throw new Error(stateChangedMessage);

    const skippedMissingFields: string[] = [];
    const skippedEmptyFields: string[] = [];
    const unchangedFields: string[] = [];
    const changedFields: PendingField[] = [];

    for (const definition of DOUBAN_FIELDS) {
        const sourceValue = getSourceValue(editedBookInfo, definition);
        if (!hasMeaningfulValue(sourceValue)) {
            skippedEmptyFields.push(definition.fieldName);
            continue;
        }

        const keyValue = definition.fieldName === "书名"
            ? primaryKeyValue
            : keyValues.find((item) => getKeyName(item) === definition.fieldName);
        if (!keyValue) {
            if (definition.fieldName === "书名" || definition.fieldName === "ISBN") {
                throw new Error(stateChangedMessage);
            }
            skippedMissingFields.push(definition.fieldName);
            continue;
        }

        const prepared = prepareFieldValue(definition, sourceValue);
        if (!prepared) {
            skippedEmptyFields.push(definition.fieldName);
            continue;
        }

        const cell = findCell(keyValue, expectedMatch.blockID);
        if (valuesEqual(definition, readCellValue(cell, definition.valueType), prepared)) {
            unchangedFields.push(definition.fieldName);
            continue;
        }

        const keyID = String(keyValue.key?.id || "").trim();
        if (!keyID) {
            if (definition.fieldName === "书名" || definition.fieldName === "ISBN") {
                throw new Error(stateChangedMessage);
            }
            skippedMissingFields.push(definition.fieldName);
            continue;
        }

        changedFields.push({
            definition,
            keyID,
            cellID: cell?.id,
            newValue: prepared.newValue,
            payload: prepared.payload,
        });
    }

    const coverKey = keyValues.find((keyValue) => getKeyName(keyValue) === COVER_FIELD.fieldName);
    const remoteCover = String(editedBookInfo?.cover || "").trim();
    const localCover = String(readCellValue(findCell(coverKey, expectedMatch.blockID), "mAsset") || "").trim();
    if (!localCover && remoteCover) {
        const coverKeyID = String(coverKey?.key?.id || "").trim();
        if (!coverKeyID) {
            skippedMissingFields.push(COVER_FIELD.fieldName);
        } else if (/^https?:\/\//i.test(remoteCover)) {
            try {
                const subjectID = String(editedBookInfo?.doubanSubjectId || "").trim();
                const referer = subjectID
                    ? `https://book.douban.com/subject/${subjectID}/`
                    : "https://book.douban.com/";
                const coverData = await getImage(remoteCover, referer);
                if (!coverData) {
                    console.warn("[doubanBookUpdate] 封面获取失败，跳过封面更新");
                } else {
                    const coverPath = await downloadCover(
                        coverData,
                        String(editedBookInfo?.title || currentMatch.localTitle || "书籍"),
                    );
                    changedFields.push({
                        definition: COVER_FIELD,
                        keyID: coverKeyID,
                        cellID: findCell(coverKey, expectedMatch.blockID)?.id,
                        newValue: coverPath,
                        payload: { mAsset: [{ content: coverPath, type: "image" }] },
                    });
                }
            } catch (error: any) {
                console.warn(`[doubanBookUpdate] 封面更新跳过：${error?.message || error}`);
            }
        }
    }

    if (changedFields.length === 0) {
        return buildEmptyUpdateResult(plugin, skippedMissingFields, skippedEmptyFields, unchangedFields);
    }

    const successfulWrites: PendingField[] = [];
    const failures: DoubanBookUpdateFailure[] = [];
    for (const field of changedFields) {
        try {
            await setAttributeViewBlockAttrStrict({
                avID: database.avID,
                keyID: field.keyID,
                itemID: expectedMatch.blockID,
                ...(field.cellID ? { cellID: field.cellID } : {}),
                value: field.payload,
            });
            successfulWrites.push(field);
        } catch (error: any) {
            failures.push({
                fieldName: field.definition.fieldName,
                error: error?.message || tx(plugin, "bookUpdateWriteFailed", "写入失败"),
            });
        }
    }

    const verifiedWrites: PendingField[] = [];
    if (successfulWrites.length > 0) {
        try {
            await reloadAttributeView(database.avID);
            keyValues = await readKeyValues(database.avID);
            const refreshedMatch = buildLocalMatch(database.avID, keyValues, normalizedISBN);
            if (refreshedMatch.status !== "matched" || refreshedMatch.blockID !== expectedMatch.blockID) {
                throw new Error(stateChangedMessage);
            }

            for (const field of successfulWrites) {
                const keyValue = field.definition.fieldName === "书名"
                    ? findBookPrimaryKeyValue(keyValues)
                    : keyValues.find((item) => getKeyName(item) === field.definition.fieldName);
                const cell = findCell(keyValue, expectedMatch.blockID);
                const refreshedValue = readCellValue(cell, field.definition.valueType);
                const prepared: PreparedFieldValue = {
                    compareValue: field.definition.fieldName === "封面"
                        ? field.newValue
                        : field.definition.valueType === "number"
                            ? field.definition.fieldName === "ISBN"
                                ? normalizeISBN(field.newValue)
                                : Number(field.newValue)
                            : field.newValue,
                    newValue: field.newValue,
                    payload: field.payload,
                };
                const verified = field.definition.fieldName === "封面"
                    ? String(refreshedValue || "").trim() === String(field.newValue).trim()
                    : valuesEqual(field.definition, refreshedValue, prepared);
                if (verified) {
                    verifiedWrites.push(field);
                } else {
                    failures.push({
                        fieldName: field.definition.fieldName,
                        error: tx(plugin, "bookUpdateVerificationFailed", "回读验证未通过"),
                    });
                }
            }
        } catch (error: any) {
            const verificationError = error?.message || tx(plugin, "bookUpdateVerificationFailed", "更新后回读验证失败");
            for (const field of successfulWrites) {
                if (!failures.some((failure) => failure.fieldName === field.definition.fieldName)) {
                    failures.push({ fieldName: field.definition.fieldName, error: verificationError });
                }
            }
        }
    }

    const updatedFields = verifiedWrites.map((field) => field.definition.fieldName);
    if (failures.length > 0) {
        return {
            code: 1,
            msg: partialFailureMessage(plugin, failures),
            updatedFields,
            failedFields: failures,
            unchangedFields,
            skippedMissingFields,
            skippedEmptyFields,
        };
    }

    const updatedLabels = updatedFields.map((fieldName) => getFieldLabel(plugin, fieldName)).join("、");
    return {
        code: 0,
        msg: tx(plugin, "bookUpdateSuccessSummary", "已更新 {count} 个字段：{fields}", {
            count: updatedFields.length,
            fields: updatedLabels,
        }),
        updatedFields,
        failedFields: [],
        unchangedFields,
        skippedMissingFields,
        skippedEmptyFields,
    };
}
