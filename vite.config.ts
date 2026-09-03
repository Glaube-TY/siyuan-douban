import { resolve } from "path";
import { defineConfig } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";
import livereload from "rollup-plugin-livereload";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import zipPack from "vite-plugin-zip-pack";
import fg from "fast-glob";

import vitePluginYamlI18n from "./yaml-plugin";
import { loadLocalEnvFile } from "./scripts/utils.js";
import { syncDevDeployment } from "./scripts/dev_deploy.js";

loadLocalEnvFile();
const env = process.env;
const isSrcmap = env.VITE_SOURCEMAP === "inline";
const isDev = env.NODE_ENV === "development";
const buildTarget = env.VITE_BUILD_TARGET === "kernel" ? "kernel" : "app";
const isKernel = buildTarget === "kernel";
const livereloadClientUrl = env.VITE_LIVERELOAD_CLIENT_URL?.trim() || "";
const outputDir = isDev ? "dev" : "dist";

console.log("isDev=>", isDev);
console.log("isSrcmap=>", isSrcmap);
console.log("outputDir=>", outputDir);
console.log("buildTarget=>", buildTarget);

const appPlugins = [
    svelte(),
    vitePluginYamlI18n({
        inDir: "public/i18n",
        outDir: `${outputDir}/i18n`,
    }),
    viteStaticCopy({
        targets: [
            { src: "./README*.md", dest: "./" },
            { src: "./plugin.json", dest: "./" },
            { src: "./preview.png", dest: "./" },
            { src: "./icon.png", dest: "./" },
            { src: "./asset/*", dest: "./asset/" },
        ],
    }),
    ...(isDev && env.SIYUAN_SKIP_DEV_DEPLOY !== "1" ? [devDeploymentMirror()] : []),
];

const kernelPlugins = [
    ...(isDev && env.SIYUAN_SKIP_DEV_DEPLOY !== "1" ? [devDeploymentMirror()] : []),
];

const appRollupPlugins = isDev
    ? [
        ...(livereloadClientUrl ? [livereload({ watch: outputDir, clientUrl: livereloadClientUrl })] : []),
        watchExternalFiles([
            "public/i18n/**",
            "./README*.md",
            "./plugin.json",
        ]),
    ]
    : [];

const kernelRollupPlugins = isDev
    ? [watchExternalFiles(["src/kernel.ts"])]
    : [
        cleanupDistFiles({
            patterns: ["i18n/*.yaml", "i18n/*.md"],
            distDir: outputDir,
        }),
        zipPack({
            inDir: "./dist",
            outDir: "./",
            outFileName: "package.zip",
        }),
    ];

export default defineConfig(isKernel ? {
    plugins: kernelPlugins,
    build: {
        outDir: outputDir,
        emptyOutDir: false,
        minify: true,
        sourcemap: isSrcmap ? "inline" : false,
        lib: {
            entry: resolve(__dirname, "src/kernel.ts"),
            name: "SiyuanDoubanKernel",
            fileName: () => "kernel.js",
            formats: ["iife"],
        },
        rollupOptions: {
            plugins: kernelRollupPlugins,
            external: [],
            output: {
                entryFileNames: "kernel.js",
            },
        },
    },
} : {
    resolve: {
        alias: {
            "@": resolve(__dirname, "src"),
        },
    },
    plugins: appPlugins,
    define: {
        "process.env.DEV_MODE": JSON.stringify(isDev),
        "process.env.NODE_ENV": JSON.stringify(env.NODE_ENV),
    },
    build: {
        outDir: outputDir,
        emptyOutDir: !isDev,
        minify: true,
        sourcemap: isSrcmap ? "inline" : false,
        lib: {
            entry: resolve(__dirname, "src/index.ts"),
            fileName: () => "index.js",
            formats: ["cjs"],
        },
        rollupOptions: {
            plugins: appRollupPlugins,
            external: ["siyuan", "process"],
            output: {
                entryFileNames: "index.js",
                assetFileNames: (assetInfo) => {
                    if (assetInfo.name === "style.css") return "index.css";
                    return assetInfo.name;
                },
            },
        },
    },
});

function watchExternalFiles(patterns: string[]) {
    return {
        name: "watch-external",
        async buildStart() {
            const files = await fg(patterns);
            for (const file of files) {
                this.addWatchFile(file);
            }
        },
    };
}

function devDeploymentMirror() {
    let missingTargetLogged = false;
    return {
        name: "dev-real-directory-deployment",
        enforce: "post" as const,
        apply: "build" as const,
        writeBundle: {
            sequential: true,
            order: "post" as const,
            handler() {
                const result = syncDevDeployment();
                if (!result) {
                    if (!missingTargetLogged) {
                        console.log("[dev-deploy] No target configured; run pnpm dev:setup once.");
                        missingTargetLogged = true;
                    }
                    return;
                }
                missingTargetLogged = false;
                console.log(
                    `[dev-deploy] Synced real directory ${result.targetDir} `
                    + `(copied ${result.copied}, unchanged ${result.unchanged}, deleted ${result.deleted})`,
                );
            },
        },
    };
}

function cleanupDistFiles(options: { patterns: string[]; distDir: string }) {
    const { patterns, distDir } = options;
    return {
        name: "rollup-plugin-cleanup",
        enforce: "post",
        writeBundle: {
            sequential: true,
            order: "post" as "post",
            async handler() {
                const fg = await import("fast-glob");
                const fs = await import("fs");
                const distPatterns = patterns.map((pattern) => `${distDir}/${pattern}`);
                console.debug("Cleanup searching patterns:", distPatterns);

                const files = await fg.default(distPatterns, {
                    dot: true,
                    absolute: true,
                    onlyFiles: false,
                });

                for (const file of files) {
                    try {
                        if (fs.default.existsSync(file)) {
                            const stat = fs.default.statSync(file);
                            if (stat.isDirectory()) {
                                fs.default.rmSync(file, { recursive: true });
                            } else {
                                fs.default.unlinkSync(file);
                            }
                            console.log(`Cleaned up: ${file}`);
                        }
                    } catch (error) {
                        console.error(`Failed to clean up ${file}:`, error);
                    }
                }
            },
        },
    };
}
