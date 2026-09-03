import type * as kernel from "siyuan/kernel";
import {
    assertSafePluginStoragePath,
    type PluginLike,
    type PluginStorageJsonState,
} from "../../utils/storage/pluginStorageStrict";

export class KernelPluginStorageAdapter implements PluginLike {
    readonly name: string;
    readonly version: string;

    constructor(private readonly api: Pick<kernel.ISiyuan, "plugin" | "storage">) {
        this.name = api.plugin.name;
        this.version = api.plugin.version;
    }

    async loadDataStrict(storageName: string): Promise<PluginStorageJsonState> {
        this.assertStoragePath(storageName);
        const entries = await this.api.storage.list(".");
        if (!entries.some((entry) => entry.name === storageName && !entry.isDir)) {
            return { exists: false };
        }

        const data = await this.api.storage.get(storageName);
        return {
            exists: true,
            value: await data.json(),
        };
    }

    async loadData(storageName: string): Promise<any> {
        const state = await this.loadDataStrict(storageName);
        return state.exists ? state.value : null;
    }

    async saveData(storageName: string, value: any): Promise<void> {
        this.assertStoragePath(storageName);
        await this.api.storage.put(storageName, serializeStorageValue(value));
    }

    private assertStoragePath(storageName: string): void {
        assertSafePluginStoragePath(this.name, storageName);
    }
}

function serializeStorageValue(value: unknown): string {
    try {
        const serialized = JSON.stringify(value, (_key, nestedValue) => {
            const valueType = typeof nestedValue;
            if (valueType === "undefined" || valueType === "function" || valueType === "symbol" || valueType === "bigint") {
                throw new TypeError(`不支持的 JSON 值类型：${valueType}`);
            }
            return nestedValue;
        });
        if (serialized === undefined) {
            throw new TypeError("数据没有可序列化内容");
        }
        return serialized;
    } catch (error) {
        throw new Error(`插件存储数据无法 JSON 序列化：${error instanceof Error ? error.message : String(error)}`);
    }
}
