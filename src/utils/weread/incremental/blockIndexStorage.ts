import type { WereadNoteUnitBlockIndex, WereadPluginLike } from "./types";

export const WEREAD_NOTE_UNIT_BLOCK_INDEX_KEY = "weread_note_unit_block_index_v1";

export function createEmptyWereadNoteUnitBlockIndex(): WereadNoteUnitBlockIndex {
    return {
        schemaVersion: 1,
        updatedAt: Date.now(),
        sources: {},
    };
}

export async function loadWereadNoteUnitBlockIndex(plugin: WereadPluginLike): Promise<WereadNoteUnitBlockIndex> {
    const raw = await plugin.loadData(WEREAD_NOTE_UNIT_BLOCK_INDEX_KEY);
    if (!raw || raw.schemaVersion !== 1 || typeof raw.sources !== "object" || raw.sources === null) {
        return createEmptyWereadNoteUnitBlockIndex();
    }

    return {
        schemaVersion: 1,
        updatedAt: Number(raw.updatedAt || Date.now()),
        sources: raw.sources || {},
    };
}

export async function saveWereadNoteUnitBlockIndex(
    plugin: WereadPluginLike,
    index: WereadNoteUnitBlockIndex
): Promise<void> {
    await plugin.saveData(WEREAD_NOTE_UNIT_BLOCK_INDEX_KEY, {
        schemaVersion: 1,
        updatedAt: Date.now(),
        sources: index.sources || {},
    });
}

