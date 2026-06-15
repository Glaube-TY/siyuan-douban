import type {
    WereadRenderItem,
    WereadRenderPatch,
    WereadSourceBlockIndex,
} from "./types";

export function diffRenderItems(
    previous: WereadSourceBlockIndex,
    nextItems: WereadRenderItem[]
): WereadRenderPatch {
    const oldItems = previous.items || {};
    const seen = new Set<string>();
    const added: WereadRenderItem[] = [];
    const changed: WereadRenderPatch["changed"] = [];
    const unchanged: WereadRenderPatch["unchanged"] = [];

    for (const next of nextItems) {
        const old = oldItems[next.itemId];
        seen.add(next.itemId);

        if (!old) {
            added.push(next);
            continue;
        }

        if (
            old.sourceHash !== next.sourceHash ||
            old.renderHash !== next.renderHash ||
            old.itemKind !== next.itemKind
        ) {
            changed.push({ previous: old, next });
            continue;
        }

        unchanged.push({ previous: old, next });
    }

    const deleted = Object.values(oldItems).filter(item => !seen.has(item.itemId));

    return {
        sourceKey: previous.sourceKey,
        added,
        changed,
        deleted,
        unchanged,
        orderedItems: nextItems,
    };
}

