import { fetchSyncPost } from "siyuan";
import { sql } from "@/api";
import { ensureAttributeViewKeys } from '../bookHandling/ensureAttributeViewKeys';
import { bindBookToNote } from '../bookHandling/bindBookToNote';
import type { MpArticleSyncUnit } from "./mpArticleSync";

/**
 * 公众号文章数据库列类型映射
 */
function getAttributeType(name: string): string {
    const typeMap: Record<string, string> = {
        "书名": "text",
        "封面": "text",
        "作者": "text",
        "出版社": "text",
        "bookID": "text",
        "sourceType": "text",
        "syncID": "text",
        "rawBookID": "text",
        "mpArticleID": "text",
    };
    return typeMap[name] || "text";
}

/**
 * 构建公众号文章数据库行数据（与普通书格式一致）
 */
function buildBlocksValues(keys: any[], unit: MpArticleSyncUnit): any[] {
    const blockValues: any[] = [];

    for (const key of keys) {
        const keyValue: any = {
            keyID: key.id,
            name: key.name
        };

        switch (key.name) {
            case "书名":
                keyValue.block = {
                    content: unit.title || ""
                };
                break;
            case "封面":
                keyValue.text = {
                    content: unit.cover || ""
                };
                break;
            case "作者":
                keyValue.text = {
                    content: unit.author || ""
                };
                break;
            case "出版社":
                keyValue.text = {
                    content: unit.publisher || ""
                };
                break;
            case "bookID":
                keyValue.text = {
                    content: unit.rawBookID || ""
                };
                break;
            case "sourceType":
                keyValue.text = {
                    content: unit.sourceType || ""
                };
                break;
            case "syncID":
                keyValue.text = {
                    content: unit.syncID || ""
                };
                break;
            case "rawBookID":
                keyValue.text = {
                    content: unit.rawBookID || ""
                };
                break;
            case "mpArticleID":
                keyValue.text = {
                    content: unit.articleID || ""
                };
                break;
            default:
                // 未处理字段添加空值
                const keyType = key.type;
                switch (keyType) {
                    case "text":
                        keyValue.text = {};
                        break;
                    case "block":
                        keyValue.block = {};
                        break;
                    default:
                        keyValue.text = {};
                }
        }

        blockValues.push(keyValue);
    }

    return blockValues;
}

/**
 * 公众号专用：添加文章到数据库并按 syncID 回查 blockID
 */
async function appendMpArticleAndGetBlockID(
    avID: string,
    databaseKeys: any[],
    unit: MpArticleSyncUnit
): Promise<{ blockID: string; matchingValue: any }> {
    // 构建行数据
    const blocksValues = buildBlocksValues(databaseKeys, unit);

    // 插入到数据库
    await fetchSyncPost("/api/av/appendAttributeViewDetachedBlocksWithValues", {
        avID: avID,
        blocksValues: [blocksValues]
    });

    // 重新获取数据库，按 syncID 回查 blockID
    const updatedDatabase = await fetchSyncPost("/api/av/getAttributeView", { "id": avID });
    const keyValues = updatedDatabase.data?.av?.keyValues || [];

    // 先在 syncID 列找到匹配的行
    const syncIDKey = keyValues.find((kv: any) => kv.key?.name === "syncID");
    if (!syncIDKey || !syncIDKey.values) {
        throw new Error("无法找到 syncID 列");
    }

    const syncIDMatch = syncIDKey.values.find((v: any) => v.text?.content === unit.syncID);
    if (!syncIDMatch) {
        throw new Error(`无法找到 syncID 为 ${unit.syncID} 的行`);
    }

    const blockID = syncIDMatch.blockID;
    if (!blockID) {
        throw new Error("syncID 匹配行没有 blockID");
    }

    // 再去书名列找到同一个 blockID 对应的 matchingValue（用于 bindBookToNote）
    const bookNameKey = keyValues.find((kv: any) => kv.key?.name === "书名");
    if (!bookNameKey || !bookNameKey.values) {
        throw new Error("无法找到书名列");
    }

    const matchingValue = bookNameKey.values.find((v: any) => v.blockID === blockID);
    if (!matchingValue) {
        throw new Error(`无法找到 blockID ${blockID} 对应的书名行`);
    }

    return { blockID, matchingValue };
}

/**
 * 公众号文章数据库落地结果
 */
export interface MpArticleDbResult {
    syncID: string;
    articleID: string;
    blockID: string;
    title: string;
}

/**
 * 将公众号文章同步单元写入数据库
 * @param plugin 插件实例
 * @param avID 数据库 ID
 * @param units 公众号文章同步单元数组
 * @returns 成功写入的文章结果数组
 */
export async function addWereadMpArticlesToDatabase(
    plugin: any,
    avID: string,
    units: MpArticleSyncUnit[]
): Promise<MpArticleDbResult[]> {
    const results: MpArticleDbResult[] = [];

    if (!units || units.length === 0) {
        return results;
    }

    // 公众号文章所需列
    const requiredAttributes = ["书名", "封面", "作者", "出版社", "bookID", "sourceType", "syncID", "rawBookID", "mpArticleID"];

    // 确保数据库包含所有必需列
    const databaseKeys = await ensureAttributeViewKeys(avID, requiredAttributes, getAttributeType);

    // 获取数据库当前 syncID 列，用于去重检查
    const getdatabase = await fetchSyncPost('/api/av/getAttributeView', { "id": avID });
    const keyValues = getdatabase.data?.av?.keyValues || [];
    const syncIDKey = keyValues.find((kv: any) => kv.key?.name === "syncID");
    const existingSyncIDs = new Set<string>();

    if (syncIDKey && syncIDKey.values) {
        for (const val of syncIDKey.values) {
            if (val.text?.content) {
                existingSyncIDs.add(val.text.content);
            }
        }
    }

    // 获取设置
    const setting = await plugin.loadData("settings.json");
    const sqlresult = await sql(`SELECT * FROM blocks WHERE id = "${setting.bookDatabaseID}"`);

    if (!sqlresult || sqlresult.length === 0) {
        throw new Error(`未找到ID为 ${setting.bookDatabaseID} 的数据库块`);
    }

    const parentInfo = sqlresult[0];

    // 处理每个文章单元
    for (const unit of units) {
        // 去重检查：优先按 syncID
        if (existingSyncIDs.has(unit.syncID)) {
            continue; // 已存在，跳过
        }

        try {
            // 添加文章到数据库（公众号专用，按 syncID 回查）
            const { blockID, matchingValue } = await appendMpArticleAndGetBlockID(
                avID,
                databaseKeys,
                unit
            );

            // 创建空白文档
            await fetchSyncPost('/api/filetree/createDocWithMd', {
                id: blockID,
                parentID: parentInfo.root_id,
                notebook: parentInfo.box,
                path: parentInfo.hpath + "/" + unit.title,
                markdown: "" // 空白文档
            });

            // 绑定数据库与文档
            await bindBookToNote(avID, blockID, matchingValue);

            // 记录结果
            results.push({
                syncID: unit.syncID,
                articleID: unit.articleID,
                blockID: blockID,
                title: unit.title
            });

            // 更新已存在集合，防止同一批次重复
            existingSyncIDs.add(unit.syncID);

        } catch (error) {
            console.error(`[addWereadMpArticlesToDatabase] 添加文章失败: ${unit.title}`, error);
            // 继续处理下一篇
        }
    }

    return results;
}