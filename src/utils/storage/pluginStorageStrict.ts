export interface PluginLike {
    name: string;
    loadDataStrict?: (storageName: string) => Promise<PluginStorageJsonState>;
}

export interface PluginStorageJsonState {
    exists: boolean;
    value?: unknown;
}

const SAFE_PATH_SEGMENT = /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/;

export function assertSafePluginStoragePath(pluginName: string, storageName: string): void {
    if (!SAFE_PATH_SEGMENT.test(pluginName || "") || !SAFE_PATH_SEGMENT.test(storageName)) {
        throw new Error(`插件存储路径无效：${storageName}`);
    }
}

export async function loadPluginStorageJsonStateStrict(
    plugin: PluginLike,
    storageName: string,
): Promise<PluginStorageJsonState> {
    assertSafePluginStoragePath(plugin?.name || "", storageName);

    if (typeof plugin?.loadDataStrict === "function") {
        const state = await plugin.loadDataStrict(storageName);
        if (!state || typeof state !== "object" || typeof state.exists !== "boolean") {
            throw new Error(`插件严格读取结果无效：${storageName}`);
        }
        if (!state.exists) return { exists: false };
        if (!Object.prototype.hasOwnProperty.call(state, "value")) {
            throw new Error(`插件严格读取结果缺少数据：${storageName}`);
        }
        return { exists: true, value: state.value };
    }

    let response: Response;
    try {
        response = await fetch("/api/file/getFile", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                path: `/data/storage/petal/${plugin.name}/${storageName}`,
            }),
        });
    } catch (error: any) {
        throw new Error(`读取插件存储失败 ${storageName}：${error?.message || String(error)}`);
    }

    let body: string;
    try {
        body = await response.text();
    } catch (error: any) {
        throw new Error(`读取插件存储失败 ${storageName}：${error?.message || String(error)}`);
    }

    if (response.status === 200) {
        if (!body.trim()) {
            throw new Error(`插件存储文件内容为空：${storageName}`);
        }
        try {
            return { exists: true, value: JSON.parse(body) };
        } catch {
            throw new Error(`插件存储 JSON 格式无效：${storageName}`);
        }
    }

    let payload: unknown;
    try {
        payload = JSON.parse(body);
    } catch {
        throw new Error(`读取插件存储失败 ${storageName}：${response.status} 响应 JSON 格式无效`);
    }

    if (response.status === 202 && isRecord(payload) && payload.code === 404) {
        return { exists: false };
    }

    const record = isRecord(payload) ? payload : {};
    const code = record.code ?? response.status;
    const rawMessage = record.msg ?? record.message;
    const message = typeof rawMessage === "string" && rawMessage
        ? rawMessage
        : response.statusText || "未知错误";
    throw new Error(`读取插件存储失败 ${storageName}：${code} ${message}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value);
}
