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

export const READING_NOTES_CAPABILITY_NAMES = [
    "reading_overview",
    "sync_status",
    "sync_history",
    "reading_statuses",
    "reading_inbox",
    "review_queue",
    "reading_topics",
    "reading_annotations",
    "diagnostics",
] as const;

export const EXPECTED_READING_NOTES_CAPABILITY_COUNT = READING_NOTES_CAPABILITY_NAMES.length;

export interface RegisteredReadingNotesCapabilities {
    names: string[];
    records: kernel.IRegisteredCapability[];
}

export class ReadingNotesCapabilityRegistrationError extends Error {
    constructor(
        message: string,
        readonly registered: RegisteredReadingNotesCapabilities,
    ) {
        super(message);
        this.name = "ReadingNotesCapabilityRegistrationError";
    }
}

export interface UnregisterReadingNotesCapabilitiesResult {
    registered: RegisteredReadingNotesCapabilities;
    errors: Array<{ name: string; error: unknown }>;
    allUnregistered: boolean;
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
        const rollback = await unregisterReadingNotesCapabilities(agent, { names, records });
        const rollbackMessage = rollback.errors.length > 0
            ? `；回滚失败：${rollback.errors.map(({ name, error: rollbackError }) => `${name}: ${safeErrorSummary(rollbackError)}`).join("；")}`
            : "";
        throw new ReadingNotesCapabilityRegistrationError(
            `读书笔记 MCP 能力注册失败：${safeErrorSummary(error)}${rollbackMessage}`,
            rollback.registered,
        );
    }

    return { names, records };
}

export async function unregisterReadingNotesCapabilities(
    agent: kernel.IAgent,
    registered: RegisteredReadingNotesCapabilities,
): Promise<UnregisterReadingNotesCapabilitiesResult> {
    const recordsByName = new Map<string, kernel.IRegisteredCapability>();
    registered.names.forEach((name, index) => {
        const record = registered.records[index];
        if (record) recordsByName.set(name, record);
    });

    const remainingNames: string[] = [];
    const errors: Array<{ name: string; error: unknown }> = [];
    for (const name of [...registered.names].reverse()) {
        try {
            await agent.unregisterCapability(name);
        } catch (error) {
            remainingNames.push(name);
            errors.push({ name, error });
        }
    }

    remainingNames.reverse();
    return {
        registered: {
            names: remainingNames,
            records: remainingNames
                .map((name) => recordsByName.get(name))
                .filter((record): record is kernel.IRegisteredCapability => !!record),
        },
        errors,
        allUnregistered: remainingNames.length === 0,
    };
}

function createCapabilityDefinitions(plugin: KernelPluginStorageAdapter): CapabilityDefinition[] {
    return [
        {
            name: READING_NOTES_CAPABILITY_NAMES[0],
            config: {
                title: "Reading overview",
                description: "Read a bounded overview of persisted local reading-notes data without starting synchronization or making external requests.",
                inputSchema: objectSchema({}),
                effects: { localRead: true },
            },
            handler: () => readReadingOverview(plugin),
        },
        {
            name: READING_NOTES_CAPABILITY_NAMES[1],
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
            name: READING_NOTES_CAPABILITY_NAMES[2],
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
            name: READING_NOTES_CAPABILITY_NAMES[3],
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
            name: READING_NOTES_CAPABILITY_NAMES[4],
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
            name: READING_NOTES_CAPABILITY_NAMES[5],
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
            name: READING_NOTES_CAPABILITY_NAMES[6],
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
            name: READING_NOTES_CAPABILITY_NAMES[7],
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
            name: READING_NOTES_CAPABILITY_NAMES[8],
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

function safeErrorSummary(error: unknown): string {
    const text = String(error instanceof Error ? error.message : error ?? "未知错误")
        .replace(/[\r\n]+/g, " ")
        .trim();
    if (!text) return "未知错误";
    if (/(api[_ -]?key|apikeyencrypted|authorization|bearer|access[_ -]?token|refresh[_ -]?token|password|secret)/i.test(text)) {
        return "错误详情包含敏感信息，已隐藏";
    }
    return text.slice(0, 240);
}
