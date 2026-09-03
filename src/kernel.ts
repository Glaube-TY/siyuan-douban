import type * as kernel from "siyuan/kernel";
import { McpRuntimeController } from "./kernel/mcp/mcpRuntimeController";
import { KernelPluginStorageAdapter } from "./kernel/storage/kernelPluginStorageAdapter";

const MCP_GET_STATE_RPC = "mcp_get_state";
const MCP_SET_ENABLED_RPC = "mcp_set_enabled";

const api: kernel.ISiyuan = siyuan;

class KernelPlugin {
    private controller: McpRuntimeController | null = null;
    private boundRpcNames: string[] = [];

    constructor(private readonly api: kernel.ISiyuan) {
        this.api.plugin.lifecycle.onload = this.onload.bind(this);
        this.api.plugin.lifecycle.onunload = this.onunload.bind(this);
    }

    private async onload(): Promise<void> {
        try {
            const storageAdapter = new KernelPluginStorageAdapter(this.api);
            const controller = new McpRuntimeController(this.api.agent, storageAdapter);
            this.controller = controller;

            await this.bindControlRpc(controller);
            await controller.initialize();

            const snapshot = controller.getSnapshot();
            if (snapshot.status === "error") {
                await this.api.logger.error(`[${this.api.plugin.name}] MCP is disabled safely: ${snapshot.lastError || "unknown controller error"}`);
            } else {
                await this.api.logger.info(
                    `[${this.api.plugin.name}] MCP controller ready: ${snapshot.status}, ${snapshot.capabilityCount}/${snapshot.expectedCapabilityCount} capabilities`,
                );
            }
        } catch (error) {
            await this.unbindControlRpc();
            this.controller = null;
            await this.api.logger.error(
                `[${this.api.plugin.name}] kernel control initialization failed: ${safeErrorSummary(error)}`,
            );
            throw new Error(`Kernel MCP 控制面初始化失败：${safeErrorSummary(error)}`);
        }
    }

    private async bindControlRpc(controller: McpRuntimeController): Promise<void> {
        await this.api.rpc.bind(
            MCP_GET_STATE_RPC,
            () => controller.getSnapshot(),
            "Read the reading-notes MCP runtime state",
        );
        this.boundRpcNames.push(MCP_GET_STATE_RPC);

        await this.api.rpc.bind(
            MCP_SET_ENABLED_RPC,
            (enabled: unknown) => {
                if (typeof enabled !== "boolean") {
                    throw new Error("mcp_set_enabled 需要 boolean 类型的 enabled 参数");
                }
                return controller.setEnabled(enabled);
            },
            "Enable or disable the reading-notes MCP capabilities",
        );
        this.boundRpcNames.push(MCP_SET_ENABLED_RPC);
    }

    private async onunload(): Promise<void> {
        const errors: string[] = [];
        if (this.controller) {
            try {
                await this.controller.shutdown();
                const lastError = this.controller.getSnapshot().lastError;
                if (lastError) errors.push(lastError);
            } catch (error) {
                errors.push(`MCP capability cleanup: ${safeErrorSummary(error)}`);
            }
        }

        await this.unbindControlRpc(errors);
        this.controller = null;

        if (errors.length > 0) {
            await this.api.logger.error(`[${this.api.plugin.name}] kernel MCP unload had errors: ${errors.join("; ")}`);
        } else {
            await this.api.logger.info(`[${this.api.plugin.name}] kernel MCP control unloaded`);
        }
    }

    private async unbindControlRpc(errors: string[] = []): Promise<void> {
        for (const name of [...this.boundRpcNames].reverse()) {
            try {
                await this.api.rpc.unbind(name);
            } catch (error) {
                errors.push(`${name}: ${safeErrorSummary(error)}`);
            }
        }
        this.boundRpcNames = [];
    }
}

function safeErrorSummary(error: unknown): string {
    const text = String(error instanceof Error ? error.message : error ?? "unknown error")
        .replace(/[\r\n]+/g, " ")
        .trim();
    if (!text) return "unknown error";
    if (/(api[_ -]?key|apikeyencrypted|authorization|bearer|access[_ -]?token|refresh[_ -]?token|password|secret)/i.test(text)) {
        return "sensitive error details omitted";
    }
    return text.slice(0, 240);
}

new KernelPlugin(api);
