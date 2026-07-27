import { getAttributeViewKeysByAvID, addAttributeViewKey, appendAttributeViewDetachedBlocksWithValues, getAttributeView } from "@/api";
import { getFrontend } from "siyuan";
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
    databaseKeys = await getAttributeViewKeysByAvID(avID);

    // 检查数据库主键是否为书名
    if (databaseKeys[0].name !== "书名") {
        await changeMainKeyName(avID);
    }

    // 检查并添加缺失的属性列
    for (const attributeName of requiredAttributes) {
        const existingAttribute = databaseKeys.find((key: { name: string }) => key.name === attributeName);

        // 如果不存在，则添加该属性列
        if (!existingAttribute) {
            await addAttributeViewKey({
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
    databaseKeys = await getAttributeViewKeysByAvID(avID);

    return databaseKeys;
}

/**
 * 将书籍数据插入属性视图并回查 blockID
 * 内部按 getFrontend() 分支：
 * - browser-desktop / browser-mobile：生成 rowID 并注入 blocksValues[0].blockID，
 *   然后按 rowID 精确回查（最多 5 次重试），书名仅作诊断日志
 * - desktop / desktop-window / mobile：保持原有书名匹配回查行为
 *
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
    buildBlocksValues: (keys: any[], data: any, rowID: string) => any
): Promise<{ blockID: string; matchingValue: any }> {
    const frontEnd = getFrontend();
    const isBrowser = frontEnd === "browser-desktop" || frontEnd === "browser-mobile";

    let rowID = "";
    if (isBrowser) {
        // 浏览器端：预生成唯一 rowID
        rowID = generateUniqueBlocked();
    }

    // 构建书籍数据
    const blocksValues = buildBlocksValues(databaseKeys, bookData, rowID);

    if (isBrowser && blocksValues.length > 0) {
        // 浏览器端：将预生成的 rowID 设置为 blocksValues[0].blockID，
        // 确保思源内核使用该 rowID 而不是自行生成不可知 ID
        blocksValues[0].blockID = rowID;
    }

    // 添加书籍数据到数据库
    await appendAttributeViewDetachedBlocksWithValues(avID, [blocksValues]);

    if (isBrowser) {
        // ========== 浏览器端：按 rowID 精确回查（最多 5 次重试） ==========
        const maxRetries = 5;
        const retryDelays = [0, 80, 160, 320, 640]; // ms，总计约 1.2s
        let lastError: Error | null = null;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            if (attempt > 0) {
                await new Promise(resolve => setTimeout(resolve, retryDelays[attempt] || 200));
            }

            try {
                const updatedDatabase = await getAttributeView(avID);
                const updatedDatabaseKeyValues = updatedDatabase.av.keyValues;

                const bookNameKeyNew = updatedDatabaseKeyValues.find((kv: any) => kv.key.name === "书名");
                if (!bookNameKeyNew) {
                    lastError = new Error("数据库中找不到书名列");
                    continue;
                }

                // 主定位：按预生成的 rowID 精确匹配 blockID
                const matchingValue = bookNameKeyNew.values.find((value: any) => {
                    return value.blockID === rowID;
                });

                if (matchingValue) {
                    return { blockID: rowID, matchingValue };
                }

                // 书名匹配仅作诊断日志，浏览器正式路径不得以此作为成功结果
                const titleMatch = bookNameKeyNew.values.find((value: any) => {
                    return value.block && value.block.content === bookData.title && value.blockID !== rowID;
                });
                if (titleMatch) {
                    console.warn(
                        `[appendBookToAttributeView:browser] 书名匹配到 blockID=${titleMatch.blockID}，` +
                        `但 rowID=${rowID} 未找到。这表示内核可能未使用预生成 rowID，请检查。`
                    );
                }

                lastError = new Error(`[rowID=${rowID}] 回查属性视图时暂未找到新增行（第 ${attempt + 1} 次尝试）`);
            } catch (err: any) {
                lastError = err;
            }
        }

        // 所有重试已用尽，抛出明确错误
        throw new Error(
            `[browser] 无法找到新添加书籍的 blockID (rowID=${rowID})：` +
            (lastError ? lastError.message : "未知原因")
        );
    } else {
        // ========== PC/手机：保持原有书名匹配回查行为 ==========
        const updatedDatabase = await getAttributeView(avID);
        const updatedDatabaseKeyValues = updatedDatabase.av.keyValues;

        const bookNameKeyNew = updatedDatabaseKeyValues.find((kv: any) => kv.key.name === "书名");
        let blockID: string | null = null;
        let matchingValue = null;

        if (bookNameKeyNew) {
            matchingValue = bookNameKeyNew.values.find((value: any) => {
                return value.block && value.block.content === bookData.title;
            });

            if (matchingValue) {
                blockID = matchingValue.blockID;
            }
        }

        if (!blockID) {
            throw new Error("无法找到新添加书籍的 blockID");
        }

        return { blockID, matchingValue };
    }
}