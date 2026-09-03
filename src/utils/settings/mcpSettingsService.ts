export type McpRuntimeStatus = "disabled" | "enabled" | "error" | "initializing";

export interface McpRuntimeState {
    schemaVersion: 1;
    enabled: boolean;
    active: boolean;
    status: McpRuntimeStatus;
    capabilityCount: number;
    expectedCapabilityCount: number;
    lastError: string | null;
}

type KernelRpcMethod = "mcp_get_state" | "mcp_set_enabled";
type PluginLike = { name: string };

let requestSequence = 0;

export function getMcpRuntimeState(plugin: PluginLike): Promise<McpRuntimeState> {
    return callKernelRpc(plugin, "mcp_get_state", []);
}

export function setMcpEnabled(plugin: PluginLike, enabled: boolean): Promise<McpRuntimeState> {
    if (typeof enabled !== "boolean") {
        return Promise.reject(new Error("MCP enabled 参数必须是 boolean"));
    }
    return callKernelRpc(plugin, "mcp_set_enabled", [enabled]);
}

async function callKernelRpc(
    plugin: PluginLike,
    method: KernelRpcMethod,
    params: unknown[],
): Promise<McpRuntimeState> {
    if (!plugin || typeof plugin.name !== "string" || !plugin.name.trim()) {
        throw new Error("无法确定插件名称，MCP Kernel 服务不可用");
    }

    let response: Response;
    try {
        response = await fetch(`/api/plugin/rpc/${encodeURIComponent(plugin.name)}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                jsonrpc: "2.0",
                method,
                params,
                id: `${Date.now()}-${++requestSequence}`,
            }),
        });
    } catch (error) {
        throw new Error(`MCP Kernel 服务请求失败：${safeErrorSummary(error)}`);
    }

    if (!response.ok) {
        throw new Error(`MCP Kernel 服务请求失败：HTTP ${response.status}`);
    }

    let payload: unknown;
    try {
        payload = await response.json();
    } catch {
        throw new Error("MCP Kernel 服务返回的不是有效 JSON");
    }

    if (!isPlainObject(payload) || payload.jsonrpc !== "2.0") {
        throw new Error("MCP Kernel 服务返回的 JSON-RPC 响应无效");
    }
    if (payload.error !== undefined && payload.error !== null) {
        throw new Error(formatRpcError(payload.error));
    }
    if (!Object.prototype.hasOwnProperty.call(payload, "result")) {
        throw new Error("MCP Kernel 服务响应缺少 result");
    }

    return validateRuntimeState(payload.result);
}

function validateRuntimeState(value: unknown): McpRuntimeState {
    if (!isPlainObject(value)) throw new Error("MCP Kernel 状态不是普通对象");
    const lastError = value.lastError;
    if (value.schemaVersion !== 1) throw new Error("MCP Kernel 状态版本无效");
    if (typeof value.enabled !== "boolean" || typeof value.active !== "boolean") {
        throw new Error("MCP Kernel 状态开关字段无效");
    }
    if (!isRuntimeStatus(value.status)) throw new Error("MCP Kernel 状态 status 无效");
    if (!isNonNegativeInteger(value.capabilityCount) || !isNonNegativeInteger(value.expectedCapabilityCount)) {
        throw new Error("MCP Kernel 状态能力数量无效");
    }
    let normalizedLastError: string | null;
    if (lastError === null) {
        normalizedLastError = null;
    } else if (typeof lastError === "string") {
        normalizedLastError = lastError;
    } else {
        throw new Error("MCP Kernel 状态错误字段无效");
    }

    return {
        schemaVersion: 1,
        enabled: value.enabled,
        active: value.active,
        status: value.status,
        capabilityCount: value.capabilityCount,
        expectedCapabilityCount: value.expectedCapabilityCount,
        lastError: normalizedLastError,
    };
}

function isRuntimeStatus(value: unknown): value is McpRuntimeStatus {
    return value === "disabled" || value === "enabled" || value === "error" || value === "initializing";
}

function isNonNegativeInteger(value: unknown): value is number {
    return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

function formatRpcError(error: unknown): string {
    if (!isPlainObject(error) || typeof error.message !== "string") {
        return "MCP Kernel 服务返回错误";
    }
    return `MCP Kernel 服务错误：${safeErrorSummary(error.message)}`;
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
