import { fetchSyncPost } from "siyuan";
import { sql, renameDoc } from "@/api";
import { ensureAttributeViewKeys } from '../bookHandling/ensureAttributeViewKeys';
import { bindBookToNote } from '../bookHandling/bindBookToNote';

/**
 * 公众号账号数据库列类型映射
 * 必需列收缩为：书名、封面、作者、出版社、bookID
 * 不再保留 sourceType/syncID/rawBookID/mpArticleID 等专用同步元字段
 * 
 * 注意：历史数据库中可能仍存在这些旧列，但当前逻辑不再依赖它们
 * 当前公众号账号行只靠 bookID 识别，不再依赖 sourceType/syncID/rawBookID/mpArticleID
 */
function getAttributeType(name: string): string {
    const typeMap: Record<string, string> = {
        "书名": "text",
        "封面": "mAsset",
        "作者": "text",
        "出版社": "text",
        "bookID": "text",
    };
    return typeMap[name] || "text";
}

/**
 * 公众号账号信息（账号级数据库行）
 * 
 * 注意：rawBookID 只是内部传递变量名，实际就是公众号账号的 bookID
 * 数据库层唯一识别键仍是 bookID，不存在独立于 bookID 之外的 rawBookID 持久化主键
 */
export interface MpAccountRecord {
    rawBookID: string;  // 内部变量：实际就是 bookID，最终写入数据库 bookID 列
    accountTitle: string;
    accountIntro: string;
    accountCover: string;
    blockID?: string;  // 可选：本地缓存中已存在的 blockID，更新同步时优先使用
}

/**
 * 构建公众号账号数据库行数据（账号级）
 */
/**
 * 构建公众号账号数据库行数据（账号级）
 * 只写入必需列：书名、封面、作者、出版社、bookID
 * 不再写入 sourceType/syncID/rawBookID/mpArticleID
 * 
 * 注意：历史数据库中可能仍存在这些旧列，但当前逻辑不再写入它们
 * 当前公众号账号行只靠 bookID 识别，sourceType 属于本地同步缓存语义
 */
function buildAccountBlocksValues(keys: any[], record: MpAccountRecord): any[] {
    const blockValues: any[] = [];

    for (const key of keys) {
        const keyValue: any = {
            keyID: key.id,
            name: key.name
        };

        switch (key.name) {
            case "书名":
                keyValue.block = {
                    content: record.accountTitle || ""
                };
                break;
            case "封面":
                if (record.accountCover) {
                    keyValue.mAsset = [{
                        content: record.accountCover,
                        type: "image"
                    }];
                } else {
                    keyValue.mAsset = [];
                }
                break;
            case "作者":
                keyValue.text = {
                    content: record.accountTitle || ""
                };
                break;
            case "出版社":
                keyValue.text = {
                    content: "微信公众号"
                };
                break;
            case "bookID":
                keyValue.text = {
                    content: record.rawBookID || ""
                };
                break;
            default:
                // 对于非必需列，根据类型写入空值
                const keyType = key.type;
                switch (keyType) {
                    case "text":
                        keyValue.text = {};
                        break;
                    case "block":
                        keyValue.block = {};
                        break;
                    case "mAsset":
                        keyValue.mAsset = [];
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
 * 从 keyValues 中获取指定 blockID 在书名列上的 matchingValue
 * 薄封装，避免各处手搓查找逻辑
 * @param keyValues 数据库 keyValues 数据
 * @param blockID 目标 blockID
 * @returns matchingValue 或 undefined
 */
function getBookNameMatchingValue(keyValues: any[], blockID: string): any | undefined {
    const bookNameKey = keyValues.find((kv: any) => kv.key?.name === "书名");
    return bookNameKey?.values?.find((v: any) => v.blockID === blockID);
}

/**
 * 公众号账号数据库落地结果
 */
export interface MpAccountDbResult {
    rawBookID: string;
    blockID: string;
    accountTitle: string;
    isNew: boolean;  // 是否新创建
}

/**
 * 确保公众号账号级数据库行存在
 * 如果不存在则创建，存在则直接返回现有 blockID
 * @param plugin 插件实例
 * @param avID 数据库 ID
 * @param record 公众号账号记录
 * @returns 账号级 blockID 和是否新创建
 */
export async function ensureMpAccountInDatabase(
    plugin: any,
    avID: string,
    record: MpAccountRecord
): Promise<MpAccountDbResult> {
    // 注意：这里的 rawBookID 实际就是 bookID，最终写入数据库 bookID 列
    // 数据库层公众号账号行只靠 bookID 识别，sourceType 属于本地同步缓存语义
    const requiredAttributes = ["书名", "封面", "作者", "出版社", "bookID"];

    // 确保数据库包含所有必需列
    const databaseKeys = await ensureAttributeViewKeys(avID, requiredAttributes, getAttributeType);

    // 获取数据库当前状态，检查是否已存在该账号
    const avData = await fetchSyncPost('/api/av/getAttributeView', { id: avID });
    const keyValues = avData.data?.av?.keyValues || [];

    // 优先：如果本地缓存中已有 blockID，直接复用（更新同步路径）
    // 这是公众号更新同步走"复用现有文档 -> 位置标记后整篇刷新"书籍式路径的关键
    if (record.blockID) {
        // 验证该 blockID 是否仍存在于当前数据库中
        const bookIDKey = keyValues.find((kv: any) => kv.key?.name === "bookID");
        const existingRow = bookIDKey?.values?.find((v: any) => v.blockID === record.blockID);
        if (existingRow) {
            // 复用现有 blockID，进行字段刷新
            const blockID = record.blockID;
            await updateMpAccountRowFields(avID, databaseKeys, keyValues, blockID, record);

            // 重新获取最新 keyValues（字段刷新后可能有新增 cell，如书名 block cell）
            const refreshedAvData = await fetchSyncPost('/api/av/getAttributeView', { id: avID });
            const refreshedKeyValues = refreshedAvData.data?.av?.keyValues || [];

            // 使用最新快照进行完整性检查（传入 databaseKeys 用于可能的主动修复）
            await ensureMpAccountDocIntegrity(plugin, avID, refreshedKeyValues, blockID, record, databaseKeys);
            return {
                rawBookID: record.rawBookID,
                blockID: blockID,
                accountTitle: record.accountTitle,
                isNew: false
            };
        }
        // 如果 blockID 已不存在于数据库中，继续走 bookID 查找路径
    }

    // 次选：通过 bookID 查找已存在的账号行
    const bookIDKey = keyValues.find((kv: any) => kv.key?.name === "bookID");
    if (bookIDKey && bookIDKey.values) {
        const existingRow = bookIDKey.values.find((v: any) => v.text?.content === record.rawBookID);
        if (existingRow && existingRow.blockID) {
            // 已存在，进行字段刷新
            const blockID = existingRow.blockID;
            await updateMpAccountRowFields(avID, databaseKeys, keyValues, blockID, record);

            // 重新获取最新 keyValues（字段刷新后可能有新增 cell，如书名 block cell）
            const refreshedAvData = await fetchSyncPost('/api/av/getAttributeView', { id: avID });
            const refreshedKeyValues = refreshedAvData.data?.av?.keyValues || [];

            // 使用最新快照进行完整性检查（传入 databaseKeys 用于可能的主动修复）
            await ensureMpAccountDocIntegrity(plugin, avID, refreshedKeyValues, blockID, record, databaseKeys);
            return {
                rawBookID: record.rawBookID,
                blockID: blockID,
                accountTitle: record.accountTitle,
                isNew: false
            };
        }
    }

    // 真正不存在，需要新建
    // 获取设置
    const setting = await plugin.loadData("settings.json");
    const sqlresult = await sql(`SELECT * FROM blocks WHERE id = "${setting.bookDatabaseID}"`);

    if (!sqlresult || sqlresult.length === 0) {
        throw new Error(`未找到ID为 ${setting.bookDatabaseID} 的数据库块`);
    }

    const parentInfo = sqlresult[0];

    // 构建行数据
    const blocksValues = buildAccountBlocksValues(databaseKeys, record);

    // 插入到数据库
    await fetchSyncPost("/api/av/appendAttributeViewDetachedBlocksWithValues", {
        avID: avID,
        blocksValues: [blocksValues]
    });

    // 重新获取数据库，按 bookID 回查 blockID
    const updatedDatabase = await fetchSyncPost("/api/av/getAttributeView", { id: avID });
    const updatedKeyValues = updatedDatabase.data?.av?.keyValues || [];

    const updatedBookIDKey = updatedKeyValues.find((kv: any) => kv.key?.name === "bookID");
    if (!updatedBookIDKey || !updatedBookIDKey.values) {
        throw new Error("无法找到 bookID 列");
    }

    const bookIDMatch = updatedBookIDKey.values.find((v: any) => v.text?.content === record.rawBookID);
    if (!bookIDMatch || !bookIDMatch.blockID) {
        throw new Error(`无法找到 bookID 为 ${record.rawBookID} 的行`);
    }

    const blockID = bookIDMatch.blockID;

    // 去书名列找到同一个 blockID 对应的 matchingValue（用于 bindBookToNote）
    const matchingValue = getBookNameMatchingValue(updatedKeyValues, blockID);
    if (!matchingValue) {
        throw new Error(`无法找到 blockID ${blockID} 对应的书名行`);
    }

    // 预取书名列 keyID（用于安全绑定兜底）
    const bookNameKeyFromDB = databaseKeys.find((k: any) => k.name === "书名");
    const bookNameKeyFromKV = updatedKeyValues.find((kv: any) => kv.key?.name === "书名")?.key?.id;
    const bookNameKeyID = bookNameKeyFromDB?.id || bookNameKeyFromKV;

    // 创建空白文档
    await fetchSyncPost('/api/filetree/createDocWithMd', {
        id: blockID,
        parentID: parentInfo.root_id,
        notebook: parentInfo.box,
        path: parentInfo.hpath + "/" + (record.accountTitle || "未命名公众号"),
        markdown: "" // 空白文档
    });

    // 绑定数据库与文档（使用安全绑定，与自愈路径统一）
    await performSafeRebind(avID, blockID, matchingValue, record, bookNameKeyID);

    return {
        rawBookID: record.rawBookID,
        blockID: blockID,
        accountTitle: record.accountTitle,
        isNew: true
    };
}

/**
 * 更新公众号账号行字段（账号行已存在时刷新字段值）
 * @param avID 数据库 ID
 * @param databaseKeys 数据库列配置
 * @param keyValues 数据库 keyValues 数据
 * @param blockID 账号行 blockID
 * @param record 公众号账号记录
 */
/**
 * 更新公众号账号数据库行字段
 * 只更新必需列：书名、封面、作者、出版社、bookID
 * 不再更新 sourceType/syncID/rawBookID/mpArticleID
 */
async function updateMpAccountRowFields(
    avID: string,
    databaseKeys: any[],
    keyValues: any[],
    blockID: string,
    record: MpAccountRecord
): Promise<void> {
    // 构建字段名到 keyID 的映射
    const keyMap = new Map<string, string>();
    for (const key of databaseKeys) {
        if (key.name) {
            keyMap.set(key.name, key.id);
        }
    }

    // 获取现有行的 cellID 映射
    const cellIDMap = new Map<string, string>();
    for (const kv of keyValues) {
        if (kv.key?.name && kv.values) {
            const cell = kv.values.find((v: any) => v.blockID === blockID);
            if (cell?.id) {
                cellIDMap.set(kv.key.name, cell.id);
            }
        }
    }

    // 定义要更新的字段（已收缩，只保留必需列）
    // 注意：历史数据库中可能仍存在 sourceType/syncID/rawBookID/mpArticleID 等旧列
    // 但当前逻辑不再更新它们，当前公众号账号行只靠 bookID 识别
    const fieldsToUpdate: { keyName: string; valueType: string; content: any }[] = [
        { keyName: "书名", valueType: "block", content: record.accountTitle || "" },
        { keyName: "作者", valueType: "text", content: record.accountTitle || "" },
        { keyName: "出版社", valueType: "text", content: "微信公众号" },
        { keyName: "封面", valueType: "mAsset", content: record.accountCover || "" },
        { keyName: "bookID", valueType: "text", content: record.rawBookID || "" }
    ];

    // 逐个更新字段
    for (const field of fieldsToUpdate) {
        const keyID = keyMap.get(field.keyName);
        const cellID = cellIDMap.get(field.keyName);
        if (!keyID) continue;

        const updatePayload: any = {
            avID: avID,
            keyID: keyID,
            rowID: blockID,
            value: {}
        };

        if (cellID) {
            updatePayload.cellID = cellID;
        }

        if (field.valueType === "block") {
            updatePayload.value.block = { content: field.content };
        } else if (field.valueType === "mAsset") {
            // 封面使用 mAsset 类型
            if (field.content) {
                updatePayload.value.mAsset = [{
                    content: field.content,
                    type: "image"
                }];
            } else {
                updatePayload.value.mAsset = [];
            }
        } else {
            updatePayload.value.text = { content: field.content };
        }

        try {
            await fetchSyncPost("/api/av/setAttributeViewBlockAttr", updatePayload);
        } catch (err) {
            // 单个字段更新失败不影响其他字段
            console.warn(`[ensureMpAccountInDatabase] 更新字段 ${field.keyName} 失败:`, err);
        }
    }
}

/**
 * 内部 helper：执行安全重绑
 * 构造完整 payload 并调用 bindBookToNote，处理所有兜底逻辑
 * @param avID 数据库 ID
 * @param blockID 账号行 blockID
 * @param matchingValue 书名列 matchingValue
 * @param record 公众号账号记录
 * @param bookNameKeyID 书名列 keyID（兜底用）
 */
async function performSafeRebind(
    avID: string,
    blockID: string,
    matchingValue: any,
    record: MpAccountRecord,
    bookNameKeyID: string | undefined
): Promise<void> {
    const finalKeyID = matchingValue.keyID || bookNameKeyID;
    if (!finalKeyID) {
        throw new Error(`公众号账号 ${record.accountTitle || blockID} 无法获取书名列 keyID，无法安全重绑`);
    }
    const now = Date.now();
    const safeMatchingValue = {
        ...matchingValue,
        id: matchingValue.id || `av-block-${blockID}`,
        keyID: finalKeyID,
        createdAt: matchingValue.createdAt || now,
        updatedAt: matchingValue.updatedAt || now,
        block: {
            id: blockID,
            content: matchingValue.block?.content || record.accountTitle || "未命名公众号",
            created: matchingValue.block?.created || now,
            updated: matchingValue.block?.updated || now
        }
    };
    await bindBookToNote(avID, blockID, safeMatchingValue);
}

/**
 * 确保公众号账号文档完整性（一致性检查与自愈）
 * 检查文档是否存在、绑定是否完整，必要时补建文档或补绑定
 * @param plugin 插件实例
 * @param avID 数据库 ID
 * @param keyValues 数据库 keyValues 数据
 * @param blockID 账号行 blockID
 * @param record 公众号账号记录
 */
async function ensureMpAccountDocIntegrity(
    plugin: any,
    avID: string,
    keyValues: any[],
    blockID: string,
    record: MpAccountRecord,
    databaseKeys?: any[]  // 用于书名 cell 缺失时主动修复
): Promise<void> {
    // 1. 检查文档是否存在（最小查询）
    const docCheck = await sql(`SELECT id FROM blocks WHERE id = "${blockID}" AND type = "d" LIMIT 1`);
    const docExists = docCheck && docCheck.length > 0;

    // 获取书名列的 matchingValue（用于 bind）
    let matchingValue = getBookNameMatchingValue(keyValues, blockID);

    // 预取稳定的书名 keyID（用于 keyID 兜底）
    const bookNameKeyFromDB = databaseKeys?.find((k: any) => k.name === "书名");
    const bookNameKeyFromKV = keyValues.find((kv: any) => kv.key?.name === "书名")?.key?.id;
    const bookNameKeyID = bookNameKeyFromDB?.id || bookNameKeyFromKV;

    // 2. 文档不存在：需要补建文档
    if (!docExists) {
        console.warn(`[ensureMpAccountDocIntegrity] 文档 ${blockID} 不存在，准备补建`);

        // 获取数据库父信息（用于确定笔记本和路径）
        const setting = await plugin.loadData("settings.json");
        const sqlresult = await sql(`SELECT * FROM blocks WHERE id = "${setting.bookDatabaseID}"`);
        if (!sqlresult || sqlresult.length === 0) {
            throw new Error(`无法获取数据库父信息以补建文档`);
        }
        const parentInfo = sqlresult[0];

        // 补建空白文档
        await fetchSyncPost('/api/filetree/createDocWithMd', {
            id: blockID,
            parentID: parentInfo.root_id,
            notebook: parentInfo.box,
            path: parentInfo.hpath + "/" + (record.accountTitle || "未命名公众号"),
            markdown: ""
        });

        // 重新获取 matchingValue（补建后可能需要刷新）
        const refreshedDb = await fetchSyncPost('/api/av/getAttributeView', { id: avID });
        const refreshedKeyValues = refreshedDb.data?.av?.keyValues || [];
        const refreshedBookNameKey = refreshedKeyValues.find((kv: any) => kv.key?.name === "书名");
        matchingValue = refreshedBookNameKey?.values?.find((v: any) => v.blockID === blockID);
    }

    // 3. 检查并补绑定（两侧完整性检查）
    if (matchingValue) {
        // 3.1 检查文档侧 custom-avs 绑定
        const attrCheck = await sql(`SELECT value FROM attributes WHERE block_id = "${blockID}" AND name = 'custom-avs' LIMIT 1`);
        const hasDocBinding = attrCheck && attrCheck.length > 0 && attrCheck[0].value;

        // 3.2 检查 AV 侧 block 绑定完整性（书名列的 block 值是否指向当前文档）
        const hasAvBinding = matchingValue.block?.id === blockID &&
                             matchingValue.block?.content != null;

        // 3.3 任一侧缺失都执行重绑
        if (!hasDocBinding || !hasAvBinding) {
            console.warn(`[ensureMpAccountDocIntegrity] 绑定不完整，准备补绑定 (docBinding=${hasDocBinding}, avBinding=${hasAvBinding})`);
            await performSafeRebind(avID, blockID, matchingValue, record, bookNameKeyID);
        }
    } else {
        console.warn(`[ensureMpAccountDocIntegrity] 无法找到 blockID ${blockID} 对应的书名行，尝试主动修复`);

        // 主动补书名主键 cell
        if (databaseKeys && databaseKeys.length > 0) {
            const bookNameKey = databaseKeys.find((k: any) => k.name === "书名");
            if (bookNameKey) {
                try {
                    await fetchSyncPost("/api/av/setAttributeViewBlockAttr", {
                        avID: avID,
                        keyID: bookNameKey.id,
                        rowID: blockID,
                        value: {
                            block: { content: record.accountTitle || "未命名公众号" }
                        }
                    });
                    console.log(`[ensureMpAccountDocIntegrity] 已补写书名 cell，刷新后重试`);

                    // 刷新 keyValues 并重新获取 matchingValue
                    const refreshedDb = await fetchSyncPost('/api/av/getAttributeView', { id: avID });
                    const refreshedKeyValues = refreshedDb.data?.av?.keyValues || [];
                    matchingValue = getBookNameMatchingValue(refreshedKeyValues, blockID);

                    // 重新进入绑定检查逻辑（如果补写成功）
                    if (matchingValue) {
                        console.log(`[ensureMpAccountDocIntegrity] 书名 cell 修复成功，继续绑定检查`);
                        // 递归调用自身，但只执行一次（有 matchingValue 会走上面的分支）
                        // 这里直接继续后面的检查逻辑
                        const attrCheck = await sql(`SELECT value FROM attributes WHERE block_id = "${blockID}" AND name = 'custom-avs' LIMIT 1`);
                        const hasDocBinding = attrCheck && attrCheck.length > 0 && attrCheck[0].value;
                        const hasAvBinding = matchingValue.block?.id === blockID &&
                                             matchingValue.block?.content != null;

                        if (!hasDocBinding || !hasAvBinding) {
                            await performSafeRebind(avID, blockID, matchingValue, record, bookNameKeyID);
                        }
                    } else {
                        // 补写后仍无法修复，明确失败
                        throw new Error(`公众号账号 ${record.accountTitle || blockID} 书名主键 cell 修复失败，无法建立可靠绑定`);
                    }
                } catch (err) {
                    // 主动修复过程出错，明确失败
                    throw new Error(`公众号账号 ${record.accountTitle || blockID} 主动修复书名 cell 失败: ${err.message || err}`);
                }
            } else {
                // 无书名列配置，无法修复
                throw new Error(`公众号账号 ${record.accountTitle || blockID} 无法找到书名列配置，无法修复绑定`);
            }
        } else {
            // 未提供 databaseKeys，无法修复
            throw new Error(`公众号账号 ${record.accountTitle || blockID} 未提供 databaseKeys，无法修复绑定`);
        }
    }

    // 4. 同步文档标题（账号名变化时）
    if (docExists && record.accountTitle) {
        await syncMpAccountDocTitle(blockID, record.accountTitle);
    }
}

/**
 * 同步公众号账号文档标题（账号名变化时重命名文档）
 * @param blockID 文档 blockID
 * @param newTitle 新账号名
 */
async function syncMpAccountDocTitle(blockID: string, newTitle: string): Promise<void> {
    try {
        // 获取文档当前信息
        const docInfo = await sql(`SELECT box, path, content FROM blocks WHERE id = "${blockID}" AND type = "d" LIMIT 1`);
        if (!docInfo || docInfo.length === 0) {
            return; // 文档不存在，跳过
        }

        const { box, path, content: currentTitle } = docInfo[0];
        if (!box || !path) {
            return; // 信息不完整，跳过
        }

        // 只有当标题确实变化时才重命名
        if (currentTitle === newTitle) {
            return; // 标题未变化，跳过
        }

        // 执行重命名（非致命，失败只打日志）
        await renameDoc(box, path, newTitle);
        console.log(`[syncMpAccountDocTitle] 文档标题已同步: "${currentTitle}" -> "${newTitle}"`);
    } catch (err) {
        // 重命名失败不阻断同步流程
        console.warn(`[syncMpAccountDocTitle] 同步文档标题失败（非致命）:`, err);
    }
}