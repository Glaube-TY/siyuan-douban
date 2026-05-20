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
    if (content === target) return true;
    if (content.includes(target)) return true;
    if (content.length >= 6 && target.includes(content)) return true;
    return false;
}

export async function updateEndBlocks(_plugin: any, blockID: string, wereadPositionMark: string, noteContent: any) {
    if (!blockID) {
        throw new Error("blockID 不存在");
    }

    const safeContent = typeof noteContent === "string" ? noteContent : String(noteContent || "");
    if (!safeContent || safeContent.length === 0) {
        throw new Error("微信读书同步内容为空");
    }

    try {
        const childBlocks = await getChildBlocks(blockID);

        const data = childBlocks || [];
        const safeMark = normalizeWereadPositionMark(wereadPositionMark);

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
            idsList = data.slice(targetIndex + 1).map(block => block.id).filter((id: string) => id && id.length > 0);
        } else {
            const markBlockResult = await appendBlock("markdown", safeMark, blockID);

            const insertedMarkID = markBlockResult?.[0]?.doOperations?.[0]?.id;
            if (!insertedMarkID) {
                throw new Error("创建微信读书同步位置标记失败");
            }
            targetBlockID = insertedMarkID;
        }

        const newBlockResult = await insertBlock("markdown", safeContent, undefined, targetBlockID);

        const newBlockID = newBlockResult?.[0]?.doOperations?.[0]?.id || "";

        for (const id of idsList) {
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
        throw error;
    }
}
