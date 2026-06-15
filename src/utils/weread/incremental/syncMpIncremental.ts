import type {
    WereadIncrementalSyncStats,
    WereadPluginLike,
    WereadRenderModel,
    WereadSourceBlockIndex,
} from "./types";
import { syncWereadBookIncremental } from "./syncBookIncremental";

export async function syncWereadMpIncremental(params: {
    plugin: WereadPluginLike;
    docBlockID: string;
    wereadPositionMark: string;
    model: WereadRenderModel;
}): Promise<{
    stats: WereadIncrementalSyncStats;
    sourceIndex: WereadSourceBlockIndex;
}> {
    return syncWereadBookIncremental(params);
}

