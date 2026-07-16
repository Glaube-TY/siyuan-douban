import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const localeFiles = {
    zh_CN: path.join(projectRoot, "public", "i18n", "zh_CN.json"),
    en_US: path.join(projectRoot, "public", "i18n", "en_US.json"),
};

function readLocale(locale, filePath) {
    const source = fs.readFileSync(filePath, "utf8");
    const keyPattern = /^\s*"((?:\\.|[^"\\])+)"\s*:/gm;
    const occurrences = new Map();
    let match;

    while ((match = keyPattern.exec(source)) !== null) {
        const key = JSON.parse(`"${match[1]}"`);
        const lines = occurrences.get(key) ?? [];
        lines.push(source.slice(0, match.index).split("\n").length);
        occurrences.set(key, lines);
    }

    const duplicates = [...occurrences.entries()].filter(([, lines]) => lines.length > 1);
    if (duplicates.length > 0) {
        const details = duplicates
            .map(([key, lines]) => `${key} (lines ${lines.join(", ")})`)
            .join("; ");
        throw new Error(`${locale} contains duplicate keys: ${details}`);
    }

    let messages;
    try {
        messages = JSON.parse(source);
    } catch (error) {
        throw new Error(`${locale} is not valid JSON: ${error.message}`);
    }

    return new Set(Object.keys(messages));
}

function difference(left, right) {
    return [...left].filter((key) => !right.has(key));
}

try {
    const zhKeys = readLocale("zh_CN", localeFiles.zh_CN);
    const enKeys = readLocale("en_US", localeFiles.en_US);
    const missingInEnglish = difference(zhKeys, enKeys);
    const missingInChinese = difference(enKeys, zhKeys);

    if (missingInEnglish.length > 0 || missingInChinese.length > 0) {
        const details = [];
        if (missingInEnglish.length > 0) {
            details.push(`missing in en_US: ${missingInEnglish.join(", ")}`);
        }
        if (missingInChinese.length > 0) {
            details.push(`missing in zh_CN: ${missingInChinese.join(", ")}`);
        }
        throw new Error(`Locale keys do not match (${details.join("; ")})`);
    }

    console.log(`[i18n] OK: ${zhKeys.size} unique keys in each locale.`);
} catch (error) {
    console.error(`[i18n] ${error.message}`);
    process.exitCode = 1;
}
