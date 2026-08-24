import {
    getAttributeViewKeysByAvID,
    reloadAttributeView,
    updateAttributeViewColumnName,
} from "@/api";
import { logError } from "../core/logger";
import { BOOK_TITLE_KEY_NAME, findBookPrimaryKey } from "./bookDatabasePrimaryKey";

export async function changeMainKeyName(avID: string): Promise<any> {
    try {
        const databaseKeys = await getAttributeViewKeysByAvID(avID);
        if (!Array.isArray(databaseKeys) || databaseKeys.length === 0) {
            throw new Error("属性视图字段配置无效，无法识别数据库主键");
        }

        const primaryKey = findBookPrimaryKey(databaseKeys);
        if (!primaryKey || primaryKey.type !== "block") {
            throw new Error("属性视图中未找到 type=block 的数据库主键");
        }

        if (primaryKey.name === BOOK_TITLE_KEY_NAME) {
            return primaryKey;
        }

        const conflictingKey = databaseKeys.find(
            (key: any) => key?.id !== primaryKey.id && key?.name === BOOK_TITLE_KEY_NAME,
        );
        if (conflictingKey) {
            const error = new Error(
                `数据库已存在普通字段“${BOOK_TITLE_KEY_NAME}”，跳过主键自动改名以保护该字段`,
            );
            console.warn(`[changeMainKeyName] ${error.message}`);
            throw error;
        }

        if (!primaryKey.id || !primaryKey.type) {
            throw new Error("数据库主键缺少 id 或 type，无法改名");
        }

        await updateAttributeViewColumnName(
            avID,
            primaryKey.id,
            BOOK_TITLE_KEY_NAME,
            primaryKey.type,
        );

        const retryDelays = [0, 80, 160, 320];
        let lastError: Error | null = null;
        for (const delay of retryDelays) {
            if (delay > 0) {
                await new Promise((resolve) => setTimeout(resolve, delay));
            }

            const refreshedKeys = await getAttributeViewKeysByAvID(avID);
            if (!Array.isArray(refreshedKeys)) {
                lastError = new Error("属性视图字段回查结果无效");
                continue;
            }

            const refreshedPrimaryKey = refreshedKeys.find((key: any) => key?.id === primaryKey.id);
            if (refreshedPrimaryKey?.name === BOOK_TITLE_KEY_NAME) {
                await reloadAttributeView(avID);
                return refreshedPrimaryKey;
            }

            lastError = new Error(
                `数据库主键 ${primaryKey.id} 改名后回查仍为“${refreshedPrimaryKey?.name || "未知名称"}”`,
            );
        }

        throw lastError || new Error("数据库主键改名后回查失败");
    } catch (error: any) {
        logError("bookHandling/changeMainKeyName", "数据库主键自动改名失败", error);
        throw error;
    }
}
