import type * as kernel from "siyuan/kernel";
import {
    EXPECTED_READING_NOTES_CAPABILITY_COUNT,
    ReadingNotesCapabilityRegistrationError,
    READING_NOTES_CAPABILITY_NAMES,
    registerReadingNotesCapabilities,
    unregisterReadingNotesCapabilities,
    type RegisteredReadingNotesCapabilities,
} from "./registerReadingNotesCapabilities";
import type { KernelPluginStorageAdapter } from "../storage/kernelPluginStorageAdapter";

export const MCP_SETTINGS_STORAGE_KEY = "mcp_settings";
export const MCP_SETTINGS_SCHEMA_VERSION = 1 as const;

export interface McpSettings {
    schemaVersion: typeof MCP_SETTINGS_SCHEMA_VERSION;
    enabled: boolean;
}

export type McpRuntimeStatus = "disabled" | "enabled" | "error" | "initializing";

export interface McpRuntimeSnapshot {
    schemaVersion: typeof MCP_SETTINGS_SCHEMA_VERSION;
    enabled: boolean;
    active: boolean;
    status: McpRuntimeStatus;
    capabilityCount: number;
    expectedCapabilityCount: number;
    lastError: string | null;
}

export class McpRuntimeController {
    private registered: RegisteredReadingNotesCapabilities = emptyRegisteredCapabilities();
    private enabled = false;
    private status: McpRuntimeStatus = "initializing";
    private lastError: string | null = null;
    private initialized = false;
    private shuttingDown = false;
    private operationQueue: Promise<void> = Promise.resolve();

    constructor(
        private readonly agent: kernel.IAgent,
        private readonly storage: KernelPluginStorageAdapter,
    ) {}

    initialize(): Promise<void> {
        return this.enqueue(async () => {
            if (this.initialized) return;

            this.status = "initializing";
            this.lastError = null;
            try {
                const settings = await this.loadSettings();
                this.enabled = settings.enabled;
                if (!settings.enabled) {
                    this.status = "disabled";
                    return;
                }

                try {
                    await this.registerAll();
                    this.status = "enabled";
                } catch (error) {
                    this.setError("MCP 自动启用失败", error);
                }
            } catch (error) {
                this.enabled = false;
                this.registered = emptyRegisteredCapabilities();
                this.setError("MCP 配置读取失败，已安全关闭", error);
            } finally {
                this.initialized = true;
            }
        });
    }

    getSnapshot(): McpRuntimeSnapshot {
        const active = this.isActive();
        const status = this.lastError
            ? "error"
            : this.status === "initializing"
                ? "initializing"
                : this.enabled && active
                    ? "enabled"
                    : "disabled";
        return {
            schemaVersion: MCP_SETTINGS_SCHEMA_VERSION,
            enabled: this.enabled,
            active,
            status,
            capabilityCount: this.registered.names.length,
            expectedCapabilityCount: EXPECTED_READING_NOTES_CAPABILITY_COUNT,
            lastError: this.lastError,
        };
    }

    setEnabled(enabled: boolean): Promise<McpRuntimeSnapshot> {
        if (typeof enabled !== "boolean") {
            return Promise.reject(new Error("mcp_set_enabled 需要 boolean 类型的 enabled 参数"));
        }

        return this.enqueue(async () => {
            if (!this.initialized) throw new Error("MCP 控制器尚未初始化");
            if (this.shuttingDown) throw new Error("MCP 控制器正在关闭");

            if (enabled && this.enabled && this.isActive() && !this.lastError) {
                this.status = "enabled";
                return this.getSnapshot();
            }
            if (!enabled && !this.enabled && this.registered.names.length === 0 && !this.lastError) {
                this.status = "disabled";
                return this.getSnapshot();
            }

            this.status = "initializing";
            this.lastError = null;
            return enabled ? this.enable() : this.disable();
        });
    }

    shutdown(): Promise<void> {
        return this.enqueue(async () => {
            if (this.shuttingDown) return;
            this.shuttingDown = true;

            const cleanup = await unregisterReadingNotesCapabilities(this.agent, this.registered);
            this.registered = cleanup.registered;
            if (cleanup.errors.length > 0) {
                this.setError("MCP 卸载清理失败", cleanup.errors.map(({ name, error }) => `${name}: ${safeErrorSummary(error)}`).join("；"));
            } else {
                this.lastError = null;
                this.status = "disabled";
            }
        });
    }

    private async loadSettings(): Promise<McpSettings> {
        const state = await this.storage.loadDataStrict(MCP_SETTINGS_STORAGE_KEY);
        if (!state.exists) {
            return { schemaVersion: MCP_SETTINGS_SCHEMA_VERSION, enabled: false };
        }
        return parseMcpSettings(state.value);
    }

    private async saveSettingsAndVerify(enabled: boolean): Promise<void> {
        const settings: McpSettings = {
            schemaVersion: MCP_SETTINGS_SCHEMA_VERSION,
            enabled,
        };
        await this.storage.saveData(MCP_SETTINGS_STORAGE_KEY, settings);
        const state = await this.storage.loadDataStrict(MCP_SETTINGS_STORAGE_KEY);
        if (!state.exists) throw new Error("保存后未找到 MCP 设置");
        const verified = parseMcpSettings(state.value);
        if (verified.enabled !== enabled) throw new Error("保存后的 MCP 设置与请求不一致");
    }

    private async enable(): Promise<McpRuntimeSnapshot> {
        if (this.isActive()) {
            try {
                await this.saveSettingsAndVerify(true);
                this.enabled = true;
                this.status = "enabled";
                this.lastError = null;
                return this.getSnapshot();
            } catch (error) {
                throw this.fail("MCP 开启失败", error);
            }
        }

        if (this.registered.names.length > 0) {
            const cleanup = await unregisterReadingNotesCapabilities(this.agent, this.registered);
            this.registered = cleanup.registered;
            if (!cleanup.allUnregistered) {
                throw this.fail(
                    "MCP 开启失败，旧能力未能完全清理",
                    cleanup.errors.map(({ name, error }) => `${name}: ${safeErrorSummary(error)}`).join("；"),
                );
            }
        }

        try {
            await this.registerAll();
        } catch (error) {
            throw this.fail("MCP 开启失败", error);
        }

        try {
            await this.saveSettingsAndVerify(true);
        } catch (error) {
            const persistenceError = safeErrorSummary(error);
            const cleanup = await unregisterReadingNotesCapabilities(this.agent, this.registered);
            this.registered = cleanup.registered;
            this.enabled = false;
            this.status = "error";
            this.lastError = `MCP 开启失败，设置未能确认保存：${persistenceError}`;
            if (cleanup.errors.length > 0) {
                this.lastError += `；已注册能力清理失败：${cleanup.errors.map(({ name, error: cleanupError }) => `${name}: ${safeErrorSummary(cleanupError)}`).join("；")}`;
            }
            throw new Error(this.lastError);
        }

        this.enabled = true;
        this.status = "enabled";
        this.lastError = null;
        return this.getSnapshot();
    }

    private async disable(): Promise<McpRuntimeSnapshot> {
        const previousEnabled = this.enabled;
        const cleanup = await unregisterReadingNotesCapabilities(this.agent, this.registered);
        this.registered = cleanup.registered;
        if (!cleanup.allUnregistered) {
            throw this.fail(
                "MCP 关闭失败，能力未能完全注销",
                cleanup.errors.map(({ name, error }) => `${name}: ${safeErrorSummary(error)}`).join("；"),
            );
        }

        try {
            await this.saveSettingsAndVerify(false);
        } catch (error) {
            const recoveryErrors: string[] = [];
            if (previousEnabled) {
                try {
                    await this.registerAll();
                    this.enabled = true;
                    try {
                        await this.saveSettingsAndVerify(true);
                    } catch (recoveryError) {
                        recoveryErrors.push(`恢复持久化状态失败：${safeErrorSummary(recoveryError)}`);
                    }
                } catch (recoveryError) {
                    recoveryErrors.push(`恢复已注册能力失败：${safeErrorSummary(recoveryError)}`);
                }
            } else {
                this.enabled = false;
            }

            this.status = "error";
            this.lastError = `MCP 关闭失败，设置未能确认保存：${safeErrorSummary(error)}`;
            if (recoveryErrors.length > 0) this.lastError += `；${recoveryErrors.join("；")}`;
            throw new Error(this.lastError);
        }

        this.enabled = false;
        this.status = "disabled";
        this.lastError = null;
        return this.getSnapshot();
    }

    private async registerAll(): Promise<void> {
        try {
            const registered = await registerReadingNotesCapabilities(this.agent, this.storage);
            if (!isCompleteRegistration(registered)) {
                const cleanup = await unregisterReadingNotesCapabilities(this.agent, registered);
                this.registered = cleanup.registered;
                throw new Error("MCP 能力注册结果不完整");
            }
            this.registered = registered;
        } catch (error) {
            if (error instanceof ReadingNotesCapabilityRegistrationError) {
                this.registered = error.registered;
            }
            throw error;
        }
    }

    private isActive(): boolean {
        return isCompleteRegistration(this.registered);
    }

    private fail(prefix: string, error: unknown): Error {
        this.status = "error";
        this.lastError = `${prefix}：${safeErrorSummary(error)}`;
        return new Error(this.lastError);
    }

    private setError(prefix: string, error: unknown): void {
        this.status = "error";
        this.lastError = `${prefix}：${safeErrorSummary(error)}`;
    }

    private enqueue<T>(operation: () => Promise<T>): Promise<T> {
        const result = this.operationQueue.then(operation, operation);
        this.operationQueue = result.then(() => undefined, () => undefined);
        return result;
    }
}

function emptyRegisteredCapabilities(): RegisteredReadingNotesCapabilities {
    return { names: [], records: [] };
}

function isCompleteRegistration(registered: RegisteredReadingNotesCapabilities): boolean {
    return registered.names.length === EXPECTED_READING_NOTES_CAPABILITY_COUNT
        && registered.records.length === EXPECTED_READING_NOTES_CAPABILITY_COUNT
        && registered.names.every((name, index) => name === READING_NOTES_CAPABILITY_NAMES[index]);
}

function parseMcpSettings(value: unknown): McpSettings {
    if (!isPlainObject(value)) throw new Error("mcp_settings 必须是普通对象");
    if (value.schemaVersion !== MCP_SETTINGS_SCHEMA_VERSION) throw new Error("mcp_settings schemaVersion 必须为 1");
    if (typeof value.enabled !== "boolean") throw new Error("mcp_settings enabled 必须是 boolean");
    return {
        schemaVersion: MCP_SETTINGS_SCHEMA_VERSION,
        enabled: value.enabled,
    };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
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
