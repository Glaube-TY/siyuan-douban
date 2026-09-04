import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(projectRoot, "plugin.json");
const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

function assertVersion(value, fieldName) {
    if (typeof value !== "string" || !VERSION_PATTERN.test(value)) {
        throw new Error(`${fieldName} must use a.b.c format`);
    }
}

function assertStringArray(value, fieldName, { nonEmpty = false } = {}) {
    if (!Array.isArray(value) || (nonEmpty && value.length === 0)) {
        throw new Error(`${fieldName} must be a${nonEmpty ? " non-empty" : ""} string array`);
    }
    if (value.some((item) => typeof item !== "string" || item.trim() === "")) {
        throw new Error(`${fieldName} must contain only non-empty strings`);
    }
    if (new Set(value).size !== value.length) {
        throw new Error(`${fieldName} must not contain duplicate values`);
    }
}

try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
        throw new Error("plugin.json must contain a JSON object");
    }
    if (typeof manifest.name !== "string" || manifest.name.trim() === "") {
        throw new Error("name must be a non-empty string");
    }
    assertVersion(manifest.version, "version");
    assertVersion(manifest.minAppVersion, "minAppVersion");

    if (manifest.kernels !== undefined) {
        assertStringArray(manifest.kernels, "kernels", { nonEmpty: true });
        if (manifest.kernels.includes("all") && manifest.kernels.length !== 1) {
            throw new Error('kernels 包含 "all" 时不能再混合其他平台，请只使用 ["all"] 或移除 "all"。');
        }
    }
    if (manifest.backends !== undefined) {
        assertStringArray(manifest.backends, "backends");
    }
    if (manifest.frontends !== undefined) {
        assertStringArray(manifest.frontends, "frontends");
    }

    console.log("[manifest] plugin.json validation passed");
} catch (error) {
    console.error(`[manifest] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
}
