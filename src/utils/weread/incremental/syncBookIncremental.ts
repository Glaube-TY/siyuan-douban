import { getChildBlocks } from "@/api";
import { normalizeWereadPositionMark } from "../../core/configDefaults";
import {
    loadWereadNoteUnitBlockIndex,
    saveWereadNoteUnitBlockIndex,
} from "./blockIndexStorage";
import { diffRenderItems } from "./diffRenderItems";
import { applyRenderPatch, rebuildManagedRegionWithRenderItems } from "./applyRenderPatch";
import { ensureWereadPositionMarkBlock } from "./positionMark";
import { validateSourceIndexAgainstChildBlocks } from "./indexValidation";
import type {
    WereadIncrementalSyncStats,
    WereadPluginLike,
    WereadRenderModel,
    WereadSourceBlockIndex,
} from "./types";

export async function syncWereadBookIncremental(params: {
    plugin: WereadPluginLike;
    docBlockID: string;
    wereadPositionMark: string;
    model: WereadRenderModel;
}): Promise<{
    stats: WereadIncrementalSyncStats;
    sourceIndex: WereadSourceBlockIndex;
}> {
    const positionMark = normalizeWereadPositionMark(params.wereadPositionMark);
    const mark = await ensureWereadPositionMarkBlock(params.docBlockID, positionMark);
    const index = await loadWereadNoteUnitBlockIndex(params.plugin);
    const syncableModel: WereadRenderModel = {
        ...params.model,
        items: params.model.items.filter(item => item.markdown.trim().length > 0),
    };
    const existing = index.sources[syncableModel.sourceKey];
    const latestChildBlocks = await getChildBlocks(params.docBlockID) || mark.childBlocks;

    const result = validateSourceIndexAgainstChildBlocks(existing, params.docBlockID, mark.positionMarkBlockID, latestChildBlocks)
        ? await applyRenderPatch({
            docBlockID: params.docBlockID,
            positionMark,
            positionMarkBlockID: mark.positionMarkBlockID,
            model: syncableModel,
            patch: diffRenderItems(existing!, syncableModel.items),
        })
        : await rebuildManagedRegionWithRenderItems({
            docBlockID: params.docBlockID,
            positionMark,
            positionMarkBlockID: mark.positionMarkBlockID,
            model: syncableModel,
        });

    index.sources[syncableModel.sourceKey] = result.sourceIndex;
    await saveWereadNoteUnitBlockIndex(params.plugin, index);

    return result;
}
