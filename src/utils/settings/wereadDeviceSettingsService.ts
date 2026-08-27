const DEVICE_SETTINGS_SCHEMA_VERSION = 1 as const;

export const WEREAD_DEVICE_SETTINGS_STORAGE_KEY = "siyuan-douban:weread-device-settings:v1";
export const WEREAD_DEVICE_SETTINGS_CHANGED_EVENT = "siyuan-douban:weread-device-settings-changed";

export interface WereadDeviceSettings {
    schemaVersion: typeof DEVICE_SETTINGS_SCHEMA_VERSION;
    autoSync: boolean;
}

function getDefaultWereadDeviceSettings(): WereadDeviceSettings {
    return {
        schemaVersion: DEVICE_SETTINGS_SCHEMA_VERSION,
        autoSync: false,
    };
}

function isWereadDeviceSettings(value: unknown): value is WereadDeviceSettings {
    if (!value || typeof value !== "object") return false;
    const record = value as Record<string, unknown>;
    return record.schemaVersion === DEVICE_SETTINGS_SCHEMA_VERSION && typeof record.autoSync === "boolean";
}

export function loadWereadDeviceSettings(): WereadDeviceSettings {
    try {
        const raw = window.localStorage.getItem(WEREAD_DEVICE_SETTINGS_STORAGE_KEY);
        if (raw === null) {
            return getDefaultWereadDeviceSettings();
        }

        const parsed: unknown = JSON.parse(raw);
        if (!isWereadDeviceSettings(parsed)) {
            console.warn("[siyuan-douban] 本设备自动同步设置格式无效，已安全关闭自动同步。", parsed);
            return getDefaultWereadDeviceSettings();
        }

        return {
            schemaVersion: DEVICE_SETTINGS_SCHEMA_VERSION,
            autoSync: parsed.autoSync,
        };
    } catch (error) {
        console.warn("[siyuan-douban] 本设备自动同步设置读取失败，已安全关闭自动同步。", error);
        return getDefaultWereadDeviceSettings();
    }
}

export function saveWereadDeviceSettings(settings: Pick<WereadDeviceSettings, "autoSync">): void {
    const normalizedAutoSync = !!settings.autoSync;
    window.localStorage.setItem(
        WEREAD_DEVICE_SETTINGS_STORAGE_KEY,
        JSON.stringify({
            schemaVersion: DEVICE_SETTINGS_SCHEMA_VERSION,
            autoSync: normalizedAutoSync,
        }),
    );
    window.dispatchEvent(new CustomEvent(WEREAD_DEVICE_SETTINGS_CHANGED_EVENT, {
        detail: { autoSync: normalizedAutoSync },
    }));
}
