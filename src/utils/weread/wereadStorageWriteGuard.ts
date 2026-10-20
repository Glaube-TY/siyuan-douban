// shortcut: this process-local lock cannot serialize other devices; kernel CAS is needed for external writers.
const writing = new Set<string>();

export function tryAcquireWereadStorageWrite(plugin: any, storage: string): (() => void) | undefined {
    const key = `${plugin.name}:${storage}`;
    if (writing.has(key)) return undefined;
    writing.add(key);
    return () => { writing.delete(key); };
}

export const wereadStorageFingerprint = (value: unknown): string => JSON.stringify(value, (_key, item) =>
    item && typeof item === "object" && !Array.isArray(item)
        ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
