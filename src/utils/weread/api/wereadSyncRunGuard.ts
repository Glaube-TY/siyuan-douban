export type WereadSyncTrigger = "auto" | "manual";

let activeWereadSyncTrigger: WereadSyncTrigger | null = null;

// ponytail: process-wide lock; split by source only if concurrent sync is later required.
export function tryRunWereadSync<T>(trigger: "auto", run: () => Promise<T>): Promise<T | undefined>;
export function tryRunWereadSync<T>(trigger: "manual", run: () => Promise<T>): Promise<T>;
export async function tryRunWereadSync<T>(trigger: WereadSyncTrigger, run: () => Promise<T>): Promise<T | undefined> {
    if (activeWereadSyncTrigger) {
        if (trigger === "auto") {
            return undefined;
        }

        const message = activeWereadSyncTrigger === "auto"
            ? "微信读书自动同步正在进行，请稍后再试。"
            : "微信读书同步正在进行，请稍后再试。";
        throw new Error(message);
    }

    activeWereadSyncTrigger = trigger;
    try {
        return await run();
    } finally {
        activeWereadSyncTrigger = null;
    }
}
