import { sql } from "@/api";

export type NoteDocumentBindingState =
    | "bound"
    | "not_created"
    | "missing"
    | "invalid";

export interface NoteDocumentBinding {
    state: NoteDocumentBindingState;
    candidateId?: string;
    documentId?: string;
    blockType?: string;
}

function normalizeCandidateId(value: unknown): string {
    return String(value || "").trim();
}

function quoteSqlText(value: string): string {
    return `'${value.replace(/'/g, "''")}'`;
}

/**
 * 属性视图值中的 blockID 表示数据库行，只有 block.id 才能作为笔记文档候选。
 */
export function getAttributeViewNoteDocumentCandidate(value: any): string {
    return normalizeCandidateId(value?.block?.id);
}

/**
 * 一次 SQL 批量验证候选 ID。调用方不得把数据库行 blockID 传入作为 fallback。
 */
export async function validateNoteDocumentBindings(
    candidateIds: Array<string | undefined | null>
): Promise<Map<string, NoteDocumentBinding>> {
    const uniqueIds = Array.from(new Set(candidateIds.map(normalizeCandidateId).filter(Boolean)));
    const result = new Map<string, NoteDocumentBinding>();
    if (uniqueIds.length === 0) return result;

    let blocks: any[] = [];
    try {
        const idList = uniqueIds.map(quoteSqlText).join(",");
        blocks = await sql(`SELECT id, type FROM blocks WHERE id IN (${idList})`);
    } catch (error) {
        console.error("[noteDocumentBinding] batch validation failed:", error);
        for (const candidateId of uniqueIds) {
            result.set(candidateId, { state: "invalid", candidateId });
        }
        return result;
    }

    const blockMap = new Map<string, any>();
    for (const block of blocks || []) {
        const id = normalizeCandidateId(block?.id);
        if (id) blockMap.set(id, block);
    }

    for (const candidateId of uniqueIds) {
        const block = blockMap.get(candidateId);
        if (!block) {
            result.set(candidateId, { state: "missing", candidateId });
        } else if (block.type !== "d") {
            result.set(candidateId, {
                state: "invalid",
                candidateId,
                blockType: String(block.type || ""),
            });
        } else {
            result.set(candidateId, {
                state: "bound",
                candidateId,
                documentId: candidateId,
                blockType: "d",
            });
        }
    }

    return result;
}

export function getNoteDocumentBinding(
    candidateId: string | undefined | null,
    bindings: Map<string, NoteDocumentBinding>
): NoteDocumentBinding {
    const normalized = normalizeCandidateId(candidateId);
    if (!normalized) return { state: "not_created" };
    return bindings.get(normalized) || { state: "missing", candidateId: normalized };
}

export function getNoteDocumentBindingLabel(state: NoteDocumentBindingState): string {
    const labels: Record<NoteDocumentBindingState, string> = {
        bound: "已绑定",
        not_created: "未创建笔记",
        missing: "笔记已失效",
        invalid: "绑定异常",
    };
    return labels[state];
}
