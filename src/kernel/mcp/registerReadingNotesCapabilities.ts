import type * as kernel from "siyuan/kernel";
import {
    readDiagnostics,
    readReadingAnnotations,
    readReadingInbox,
    readReadingOverview,
    readReadingStatuses,
    readReadingTopics,
    readReviewQueue,
    readSyncHistory,
    readSyncStatus,
} from "./readServices";
import type { KernelPluginStorageAdapter } from "../storage/kernelPluginStorageAdapter";

export interface RegisteredReadingNotesCapabilities {
    names: string[];
    records: kernel.IRegisteredCapability[];
}

interface CapabilityDefinition {
    name: string;
    config: kernel.IAgentCapabilityConfig;
    handler: kernel.TAgentCapabilityHandler;
}

export async function registerReadingNotesCapabilities(
    agent: kernel.IAgent,
    plugin: KernelPluginStorageAdapter,
): Promise<RegisteredReadingNotesCapabilities> {
    const names: string[] = [];
    const records: kernel.IRegisteredCapability[] = [];

    try {
        for (const definition of createCapabilityDefinitions(plugin)) {
            const record = await agent.registerCapability(definition.name, definition.config, definition.handler);
            names.push(definition.name);
            records.push(record);
        }
    } catch (error) {
        const rollbackErrors: string[] = [];
        for (const name of [...names].reverse()) {
            try {
                await agent.unregisterCapability(name);
            } catch (rollbackError) {
                rollbackErrors.push(`${name}: ${String(rollbackError)}`);
            }
        }
        const rollbackMessage = rollbackErrors.length > 0
            ? `；回滚失败：${rollbackErrors.join("；")}`
            : "";
        throw new Error(`读书笔记 MCP 能力注册失败：${String(error)}${rollbackMessage}`);
    }

    return { names, records };
}

function createCapabilityDefinitions(plugin: KernelPluginStorageAdapter): CapabilityDefinition[] {
    return [
        {
            name: "reading_overview",
            config: {
                title: "Reading overview",
                description: "Read a bounded overview of persisted local reading-notes data without starting synchronization or making external requests.",
                inputSchema: objectSchema({}),
                effects: { localRead: true },
            },
            handler: () => readReadingOverview(plugin),
        },
        {
            name: "sync_status",
            config: {
                title: "Persisted sync status",
                description: "Read the latest persisted WeRead synchronization report and bounded non-success problems; this is not live frontend runtime progress.",
                inputSchema: objectSchema({
                    problemLimit: integerSchema(1, 20, 10),
                }),
                effects: { localRead: true },
            },
            handler: (input) => readSyncStatus(plugin, input),
        },
        {
            name: "sync_history",
            config: {
                title: "Sync history",
                description: "Read a bounded descending history of persisted WeRead synchronization report summaries without returning full report items.",
                inputSchema: objectSchema({
                    limit: integerSchema(1, 20, 5),
                    status: enumSchema(["success", "partial", "partial_success", "failed", "running", "cancelled"]),
                }),
                effects: { localRead: true },
            },
            handler: (input) => readSyncHistory(plugin, input),
        },
        {
            name: "reading_statuses",
            config: {
                title: "Reading statuses",
                description: "Search and page through local reading-book status records by status, source type, title, book ID, or source key.",
                inputSchema: objectSchema({
                    status: enumSchema(["not_started", "reading", "finished", "to_review", "reviewing", "reviewed", "archived"]),
                    sourceType: enumSchema(["weread-book", "weread-mp", "local-book"]),
                    query: { type: "string" },
                    limit: integerSchema(1, 100, 30),
                    offset: { type: "integer", minimum: 0, default: 0 },
                }),
                effects: { localRead: true },
            },
            handler: (input) => readReadingStatuses(plugin, input),
        },
        {
            name: "reading_inbox",
            config: {
                title: "Reading inbox",
                description: "Search and page through local reading inbox items, returning only bounded fields useful for understanding highlights and reviews.",
                inputSchema: objectSchema({
                    status: enumSchema(["unprocessed", "processed", "ignored", "later"]),
                    sourceKey: { type: "string" },
                    query: { type: "string" },
                    limit: integerSchema(1, 100, 30),
                    offset: { type: "integer", minimum: 0, default: 0 },
                }),
                effects: { localRead: true },
            },
            handler: (input) => readReadingInbox(plugin, input),
        },
        {
            name: "review_queue",
            config: {
                title: "Review queue",
                description: "Read the local spaced-review queue with due filtering, bounded pagination, and next-interval previews; never changes review state.",
                inputSchema: objectSchema({
                    dueOnly: { type: "boolean", default: true },
                    sourceKey: { type: "string" },
                    limit: integerSchema(1, 100, 30),
                    offset: { type: "integer", minimum: 0, default: 0 },
                }),
                effects: { localRead: true },
            },
            handler: (input) => readReviewQueue(plugin, input),
        },
        {
            name: "reading_topics",
            config: {
                title: "Reading topics",
                description: "Read local reading topic metadata and bounded topic contents when explicitly requested; never creates or changes topics.",
                inputSchema: objectSchema({
                    topicId: { type: "string" },
                    includeItems: { type: "boolean", default: false },
                    limit: integerSchema(1, 100, 30),
                    offset: { type: "integer", minimum: 0, default: 0 },
                }),
                effects: { localRead: true },
            },
            handler: (input) => readReadingTopics(plugin, input),
        },
        {
            name: "reading_annotations",
            config: {
                title: "Reading annotations",
                description: "Search and page through the validated local reading-annotation archive by source, book, annotation type, or text.",
                inputSchema: objectSchema({
                    sourceKey: { type: "string" },
                    bookID: { type: "string" },
                    annotationType: enumSchema(["highlight", "review"]),
                    query: { type: "string" },
                    limit: integerSchema(1, 100, 30),
                    offset: { type: "integer", minimum: 0, default: 0 },
                }),
                effects: { localRead: true },
            },
            handler: (input) => readReadingAnnotations(plugin, input),
        },
        {
            name: "diagnostics",
            config: {
                title: "Reading-notes diagnostics",
                description: "Read bounded local cache and persisted-sync diagnostics with credential presence booleans only; secrets and templates are never returned.",
                inputSchema: objectSchema({
                    problemLimit: integerSchema(1, 20, 10),
                }),
                effects: { localRead: true },
            },
            handler: (input) => readDiagnostics(plugin, input),
        },
    ];
}

function objectSchema(properties: Record<string, unknown>): kernel.IAgentCapabilityConfig["inputSchema"] {
    return {
        type: "object",
        properties,
        additionalProperties: false,
    } as kernel.IAgentCapabilityConfig["inputSchema"];
}

function integerSchema(minimum: number, maximum: number, defaultValue: number): Record<string, unknown> {
    return { type: "integer", minimum, maximum, default: defaultValue };
}

function enumSchema(values: readonly string[]): Record<string, unknown> {
    return { type: "string", enum: [...values] };
}
