import { getChildBlocks } from "@/api";
import type { WereadSourceBlockIndex } from "./types";

export function validateSourceIndexAgainstChildBlocks(
    sourceIndex: WereadSourceBlockIndex | undefined,
    docBlockID: string,
    positionMarkBlockID: string,
    childBlocks: Array<{ id: string }>
): boolean {
    if (!sourceIndex) return false;
    if (sourceIndex.docBlockID !== docBlockID) return false;
    if (sourceIndex.positionMarkBlockID !== positionMarkBlockID) return false;

    const childIDs = new Set(childBlocks.map(block => block.id));
    if (!childIDs.has(positionMarkBlockID)) return false;

    for (const item of Object.values(sourceIndex.items || {})) {
        if (!item.blockIds || !Array.isArray(item.blockIds) || item.blockIds.length === 0) {
            return false;
        }
        for (const blockId of item.blockIds) {
            if (!childIDs.has(blockId)) {
                return false;
            }
        }
    }

    return true;
}

export async function hasUsableWereadSourceIndexForDoc(
    sourceIndex: WereadSourceBlockIndex | undefined,
    docBlockID: string | undefined
): Promise<boolean> {
    if (!sourceIndex || !docBlockID) return false;
    if (!sourceIndex.positionMarkBlockID) return false;

    try {
        const childBlocks = await getChildBlocks(docBlockID) || [];
        return validateSourceIndexAgainstChildBlocks(
            sourceIndex,
            docBlockID,
            sourceIndex.positionMarkBlockID,
            childBlocks
        );
    } catch {
        return false;
    }
}

