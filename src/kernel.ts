import type * as kernel from "siyuan/kernel";
import { registerReadingNotesCapabilities } from "./kernel/mcp/registerReadingNotesCapabilities";
import type { RegisteredReadingNotesCapabilities } from "./kernel/mcp/registerReadingNotesCapabilities";
import { KernelPluginStorageAdapter } from "./kernel/storage/kernelPluginStorageAdapter";

const api: kernel.ISiyuan = siyuan;

class KernelPlugin {
    private storageAdapter: KernelPluginStorageAdapter | null = null;
    private registered: RegisteredReadingNotesCapabilities = { names: [], records: [] };

    constructor(private readonly api: kernel.ISiyuan) {
        this.api.plugin.lifecycle.onload = this.onload.bind(this);
        this.api.plugin.lifecycle.onunload = this.onunload.bind(this);
    }

    private async onload(): Promise<void> {
        try {
            this.storageAdapter = new KernelPluginStorageAdapter(this.api);
            this.registered = await registerReadingNotesCapabilities(this.api.agent, this.storageAdapter);
            await this.api.logger.info(
                `[${this.api.plugin.name}] registered ${this.registered.records.length} reading-notes capabilities for ${this.api.plugin.version}`,
            );
        } catch (error) {
            this.storageAdapter = null;
            this.registered = { names: [], records: [] };
            await this.api.logger.error(`[${this.api.plugin.name}] kernel MCP initialization failed: ${String(error)}`);
            throw error;
        }
    }

    private async onunload(): Promise<void> {
        const names = this.registered.names.slice().reverse();
        const errors: string[] = [];
        for (const name of names) {
            try {
                await this.api.agent.unregisterCapability(name);
            } catch (error) {
                errors.push(`${name}: ${String(error)}`);
            }
        }
        this.registered = { names: [], records: [] };
        this.storageAdapter = null;
        if (errors.length > 0) {
            await this.api.logger.error(`[${this.api.plugin.name}] kernel MCP unload had errors: ${errors.join("; ")}`);
        } else {
            await this.api.logger.info(`[${this.api.plugin.name}] unregistered reading-notes capabilities`);
        }
    }
}

new KernelPlugin(api);
