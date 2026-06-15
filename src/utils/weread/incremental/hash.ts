export function stableStringify(value: any): string {
    const seen = new WeakSet<object>();

    const stringify = (input: any): any => {
        if (input === null || typeof input !== "object") return input;
        if (seen.has(input)) return "[Circular]";
        seen.add(input);

        if (Array.isArray(input)) {
            return input.map(item => stringify(item));
        }

        const result: Record<string, any> = {};
        for (const key of Object.keys(input).sort()) {
            const val = input[key];
            if (val === undefined || typeof val === "function") continue;
            result[key] = stringify(val);
        }
        return result;
    };

    return JSON.stringify(stringify(value));
}

export function hashText(text: string): string {
    const input = String(text || "");
    let h1 = 0xdeadbeef ^ input.length;
    let h2 = 0x41c6ce57 ^ input.length;

    for (let i = 0; i < input.length; i++) {
        const ch = input.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }

    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);

    const combined = 4294967296 * (2097151 & h2) + (h1 >>> 0);
    return combined.toString(36);
}

export function hashObject(value: any): string {
    return hashText(stableStringify(value));
}

export function normalizeMarkdownForHash(markdown: string): string {
    return String(markdown || "")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .replace(/[ \t]+$/gm, "")
        .trim();
}

