import { appendBlock, getChildBlocks } from "@/api";
import { DEFAULT_WEREAD_POSITION_MARK, normalizeWereadPositionMark } from "../../core/configDefaults";

export function normalizePositionMarkText(text: string): string {
    return String(text)
        .trim()
        .replace(/^#{1,6}\s+/, "")
        .replace(/^[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F000}-\u{1F02F}\u{1F0A0}-\u{1F0FF}\u{200D}\u{20E3}\u{231A}-\u{231B}\u{23E9}-\u{23F3}\u{23F8}-\u{23FA}\u{25AA}-\u{25AB}\u{25B6}\u{25C0}\u{25FB}-\u{25FE}]+/u, "")
        .trim();
}

export function isPositionMarkBlock(block: { content: string }, mark: string): boolean {
    const target = normalizePositionMarkText(mark);
    const content = normalizePositionMarkText(block.content);
    if (!target || !content) return false;
    if (content === target) return true;
    if (content.includes(target)) return true;
    if (content.length >= 6 && target.includes(content)) return true;
    return false;
}

export async function ensureWereadPositionMarkBlock(
    docBlockID: string,
    wereadPositionMark: string
): Promise<{
    positionMarkBlockID: string;
    childBlocks: IResGetChildBlock[];
}> {
    if (!docBlockID) {
        throw new Error("目标文档 blockID 不存在");
    }

    const safeMark = normalizeWereadPositionMark(wereadPositionMark);
    const candidateMarks = Array.from(new Set([
        safeMark,
        DEFAULT_WEREAD_POSITION_MARK,
    ].map(normalizeWereadPositionMark)));

    let childBlocks = await getChildBlocks(docBlockID) || [];
    const targetBlock = childBlocks.find(block => candidateMarks.some(mark => isPositionMarkBlock(block, mark)));
    if (targetBlock?.id) {
        return {
            positionMarkBlockID: targetBlock.id,
            childBlocks,
        };
    }

    const markBlockResult = await appendBlock("markdown", safeMark, docBlockID);
    const insertedMarkID = markBlockResult?.[0]?.doOperations?.[0]?.id || "";
    if (!insertedMarkID) {
        throw new Error("创建微信读书同步位置标记失败");
    }

    childBlocks = await getChildBlocks(docBlockID) || [];
    return {
        positionMarkBlockID: insertedMarkID,
        childBlocks,
    };
}

