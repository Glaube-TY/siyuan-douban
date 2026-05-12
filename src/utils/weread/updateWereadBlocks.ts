import { logError } from "../core/logger";
import { getChildBlocks, insertBlock, deleteBlock, appendBlock } from "@/api";
import { DEFAULT_WEREAD_POSITION_MARK, normalizeWereadPositionMark } from "../core/configDefaults";

/**
 * 规范化位置标记文本：去掉前后空格、Markdown 标题前缀、视觉 emoji 前缀
 */
function normalizePositionMarkText(text: string): string {
    return String(text)
        .trim()
        .replace(/^#{1,6}\s+/, '')
        .replace(/^[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F000}-\u{1F02F}\u{1F0A0}-\u{1F0FF}\u{200D}\u{20E3}\u{231A}-\u{231B}\u{23E9}-\u{23F3}\u{23F8}-\u{23FA}\u{25AA}-\u{25AB}\u{25B6}\u{25C0}\u{25FB}-\u{25FE}]+/u, '')
        .trim();
}

/**
 * 判断一个块是否是位置标记块（模糊匹配）
 */
function isPositionMarkBlock(block: { content: string }, mark: string): boolean {
    const target = normalizePositionMarkText(mark);
    const content = normalizePositionMarkText(block.content);
    if (!target || !content) return false;
    return content === target || content.includes(target) || target.includes(content);
}

export async function updateEndBlocks(_plugin: any, blockID: string, wereadPositionMark: string, noteContent: any) {
    // 检查 blockID 是否存在
    if (!blockID) {
        throw new Error("blockID 不存在");
    }

    try {
        const childBlocks = await getChildBlocks(blockID);

        // 检查是否有子块（空文档场景也兼容，视为首次写入）
        const data = childBlocks || [];
        const safeMark = normalizeWereadPositionMark(wereadPositionMark);

        // 候选标记数组：当前设置标记 + 默认标记，去重
        const candidateMarks = Array.from(new Set([
            safeMark,
            DEFAULT_WEREAD_POSITION_MARK,
        ].map(normalizeWereadPositionMark)));

        let targetBlock = data.find(block =>
            candidateMarks.some(mark => isPositionMarkBlock(block, mark))
        );
        let targetBlockID: string | null = null;
        let idsList: string[] = [];

        if (targetBlock) {
            targetBlockID = targetBlock.id;
            const targetIndex = data.indexOf(targetBlock);
            // 记录标记块之后的所有旧块 ID，用于后续删除
            idsList = data.slice(targetIndex + 1).map(block => block.id);
        } else {
            // 如果没有找到标记块，则在文档末尾添加标记块
            // 使用 appendBlock 追加到文档末尾，避免空文档时 previousID 传 document id 的不稳定问题
            const markBlockResult = await appendBlock("markdown", safeMark, blockID);

            // 防御式 ID 提取，避免 API 返回结构异常时报 undefined
            const insertedMarkID = markBlockResult?.[0]?.doOperations?.[0]?.id;
            if (!insertedMarkID) {
                throw new Error("创建微信读书同步位置标记失败");
            }
            targetBlockID = insertedMarkID;
        }

        // 【关键改动】先插入新内容，成功后再删除旧内容
        // 这样即使插入失败，旧内容仍然保留
        const newBlockResult = await insertBlock("markdown", noteContent, undefined, targetBlockID);

        // 防御式 ID 提取
        const newBlockID = newBlockResult?.[0]?.doOperations?.[0]?.id || "";

        // 新内容插入成功后，再删除旧内容
        // 删除时跳过刚插入的新块（以防万一新块也在 idsList 中）
        for (const id of idsList) {
            // 确保不删除刚插入的新块
            if (id === newBlockID) {
                continue;
            }
            try {
                await deleteBlock(id);
            } catch (error) {
                logError("weread/updateWereadBlocks", `删除块 ${id} 时出错`, error);
            }
        }
    } catch (error) {
        logError("weread/updateWereadBlocks", `获取子块或更新块时出错，blockID: ${blockID}`, error);
        // 重新抛出错误，以便在调用函数中处理
        throw error;
    }
}