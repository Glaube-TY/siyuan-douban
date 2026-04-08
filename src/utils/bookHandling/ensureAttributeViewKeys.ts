import { fetchSyncPost } from "siyuan";
import { changeMainKeyName } from './changeMainKeyName';
import { generateUniqueBlocked } from '../core/formatOp';

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
    getAttributeType: (name: string) => string
): Promise<any[]> {
    let databaseKeys: any;

    // 获取数据库详细列配置
    await fetchSyncPost("/api/av/getAttributeViewKeysByAvID", { avID: avID }).then((res) => databaseKeys = res.data);

    // 检查数据库主键是否为书名
    if (databaseKeys[0].name !== "书名") {
        await changeMainKeyName(avID);
    }

    // 检查并添加缺失的属性列
    for (const attributeName of requiredAttributes) {
        const existingAttribute = databaseKeys.find((key: { name: string }) => key.name === attributeName);

        // 如果不存在，则添加该属性列
        if (!existingAttribute) {
            await fetchSyncPost("/api/av/addAttributeViewKey", {
                avID: avID,
                keyID: generateUniqueBlocked(),
                keyName: attributeName,
                keyType: getAttributeType(attributeName),
                keyIcon: "",
                previousKeyID: databaseKeys.at(-1)?.id || "",
            });
        }
    }

    // 获取更新后的数据库列配置
    await fetchSyncPost("/api/av/getAttributeViewKeysByAvID", {
        avID: avID,
    }).then((res) => databaseKeys = res.data);

    return databaseKeys;
}

/**
 * 将书籍数据插入属性视图并回查 blockID
 * @param avID 数据库 ID
 * @param databaseKeys 数据库列配置
 * @param bookData 书籍数据对象
 * @param buildBlocksValues 构建 blocksValues 的函数
 * @returns 包含 blockID 和 matchingValue 的对象
 */
export async function appendBookToAttributeView(
    avID: string,
    databaseKeys: any[],
    bookData: { title: string },
    buildBlocksValues: (keys: any[], data: any) => any
): Promise<{ blockID: string; matchingValue: any }> {
    // 构建书籍数据
    const blocksValues = buildBlocksValues(databaseKeys, bookData);

    // 添加书籍数据到数据库
    await fetchSyncPost("/api/av/appendAttributeViewDetachedBlocksWithValues", {
        avID: avID,
        blocksValues: [blocksValues]
    });

    // 获取数据库信息并匹配新添加的书籍行的 blockID
    const updatedDatabase = await fetchSyncPost("/api/av/getAttributeView", { "id": avID });
    const updatedDatabaseKeyValues = updatedDatabase.data.av.keyValues;

    // 查找书名列
    const bookNameKeyNew = updatedDatabaseKeyValues.find((kv: any) => kv.key.name === "书名");
    let blockID: string | null = null;
    let matchingValue = null;

    if (bookNameKeyNew) {
        // 查找匹配书名的书籍
        matchingValue = bookNameKeyNew.values.find((value: any) => {
            return value.block && value.block.content === bookData.title;
        });

        if (matchingValue) {
            blockID = matchingValue.blockID;
        }
    }

    // 如果找不到 blockID，则抛出错误
    if (!blockID) {
        throw new Error("无法找到新添加书籍的 blockID");
    }

    return { blockID, matchingValue };
}