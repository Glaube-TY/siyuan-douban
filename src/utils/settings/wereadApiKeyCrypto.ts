const CRYPTO_KEY = "siyuan-douban-weread-api-key-v1";
const ENCRYPTED_PREFIX = "enc:v1:";

function xorBytes(input: Uint8Array, key: string): Uint8Array {
    const keyBytes = new TextEncoder().encode(key);
    const output = new Uint8Array(input.length);
    for (let i = 0; i < input.length; i++) {
        output[i] = input[i] ^ keyBytes[i % keyBytes.length];
    }
    return output;
}

function bytesToBase64(bytes: Uint8Array): string {
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

export function encryptWereadApiKey(apiKey: string): string {
    const plainBytes = new TextEncoder().encode(apiKey);
    const encrypted = xorBytes(plainBytes, CRYPTO_KEY);
    return ENCRYPTED_PREFIX + bytesToBase64(encrypted);
}

export function decryptWereadApiKey(encrypted: string): string {
    if (!encrypted || !encrypted.startsWith(ENCRYPTED_PREFIX)) {
        throw new Error("Invalid encrypted format");
    }
    const b64 = encrypted.slice(ENCRYPTED_PREFIX.length);
    const encryptedBytes = base64ToBytes(b64);
    const decrypted = xorBytes(encryptedBytes, CRYPTO_KEY);
    return new TextDecoder().decode(decrypted);
}

export function isEncryptedWereadApiKey(value: any): boolean {
    return typeof value === "string" && value.startsWith(ENCRYPTED_PREFIX);
}

export function sanitizeWereadAuthSettingsForSave(
    raw: Record<string, any>,
    apiKeyPlain: string
): Record<string, any> {
    return {
        ...raw,
        provider: raw.provider || "apiKey",
        apiKey: "",
        apiKeyEncrypted: apiKeyPlain ? encryptWereadApiKey(apiKeyPlain) : "",
        apiKeyCryptoVersion: 1,
        verified: raw.verified ?? false,
        verifiedAt: raw.verifiedAt ?? 0,
        apiProtocolVersion: raw.apiProtocolVersion ?? "",
        lastError: raw.lastError ?? "",
    };
}
