import { getAttributeViewKeysByAvID, addAttributeViewKey, appendAttributeViewDetachedBlocksWithValues, getAttributeView } from "@/api";
import { changeMainKeyName } from './changeMainKeyName';
import { generateUniqueBlocked } from '../core/formatOp';
import { BOOK_TITLE_KEY_NAME, findBookPrimaryKey, findBookPrimaryKeyValue } from './bookDatabasePrimaryKey';

/**
 * 确保数据库包含所有必需的属性列
 * @param avID 数据库 ID
 * @param requiredAttributes 必需的属性列数组
 * @param getAttributeType 获取属性类型的函数
 * @returns 最新的 databaseKeys
 */
export async function ensureAttributeViewKeys(
    avID: string,
    requiredAttributes: string[],
    getAttributeType: (name: string) => string | undefined
): Promise<any[]> {
    let databaseKeys = await getAttributeViewKeysByAvID(avID);

    if (!Array.isArray(databaseKeys)) {
        throw new Error("属性视图字段配置无效，无法确保数据库结构");
    }

    const primaryKey = findBookPrimaryKey(databaseKeys);
    if (!primaryKey || primaryKey.type !== "block") {
        throw new Error("属性视图中未找到 type=block 的数据库主键");
    }

    if (primaryKey.name !== BOOK_TITLE_KEY_NAME) {
        try {
            await changeMainKeyName(avID);
        } catch (error: any) {
            console.warn(`[ensureAttributeViewKeys] 数据库主键自动改名失败，继续使用 type=block 主键: ${error?.message || error}`);
        }

        databaseKeys = await getAttributeViewKeysByAvID(avID);
        if (!Array.isArray(databaseKeys)) {
            throw new Error("数据库主键改名后字段回查结果无效");
        }
    }

    // 检查并添加缺失的属性列
    for (const attributeName of requiredAttributes) {
        if (attributeName === BOOK_TITLE_KEY_NAME) {
            continue;
        }

        const existingAttribute = databaseKeys.find((key: { name: string }) => key.name === attributeName);

        // 如果不存在，则添加该属性列
        if (!existingAttribute) {
            const keyType = getAttributeType(attributeName);
            if (!keyType) {
                throw new Error(`未定义属性“${attributeName}”的字段类型，拒绝创建未知字段`);
            }

            await addAttributeViewKey({
                avID: avID,
                keyID: generateUniqueBlocked(),
                keyName: attributeName,
                keyType,
                keyIcon: "",
                previousKeyID: databaseKeys.at(-1)?.id || "",
            });
        }
    }

    // 获取更新后的数据库列配置
    databaseKeys = await getAttributeViewKeysByAvID(avID);
    if (!Array.isArray(databaseKeys)) {
        throw new Error("数据库结构更新后字段回查结果无效");
    }

    return databaseKeys;
}

/**
 * Insert with a unique row ID on every frontend and read back that exact row.
 * Titles are display text, never the identity of the newly inserted row.
 */
export async function appendBookToAttributeView(
    avID: string,
    databaseKeys: any[],
    bookData: { title: string },
    buildBlocksValues: (keys: any[], data: any, rowID: string) => any
): Promise<{ blockID: string; matchingValue: any }> {
    const rowID = generateUniqueBlocked();
    const blocksValues = buildBlocksValues(databaseKeys, bookData, rowID);
    if (!Array.isArray(blocksValues) || blocksValues.length === 0) {
        throw new Error("书籍属性值为空，拒绝创建无法定位的数据库行");
    }
    // Reuse the existing browser path: the kernel accepts an explicit row ID.
    blocksValues[0].blockID = rowID;
    await appendAttributeViewDetachedBlocksWithValues(avID, [blocksValues]);

    const retryDelays = [0, 80, 160, 320, 640, 200];
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < retryDelays.length; attempt++) {
        if (attempt > 0) await new Promise(resolve => setTimeout(resolve, retryDelays[attempt]));
        try {
            const database = await getAttributeView(avID);
            const titleKey = findBookPrimaryKeyValue(database?.av?.keyValues);
            const matchingValue = titleKey?.values?.find((value: any) => value.blockID === rowID);
            if (matchingValue) return { blockID: rowID, matchingValue };
            lastError = new Error(`[rowID=${rowID}] 回查属性视图时暂未找到新增行（第 ${attempt + 1} 次尝试）`);
        } catch (error: any) {
            lastError = error;
        }
    }
    throw new Error(`无法找到新添加书籍的 blockID (rowID=${rowID})：${lastError?.message || "未知原因"}`);
}
