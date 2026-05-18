// vite.config.ts
import { resolve as resolve2 } from "path";
import { defineConfig } from "file:///E:/MyCode/siyuanPlugin/siyuan-douban/node_modules/.pnpm/vite@5.4.18_@types+node@20.17.30_sass@1.87.0/node_modules/vite/dist/node/index.js";
import { viteStaticCopy } from "file:///E:/MyCode/siyuanPlugin/siyuan-douban/node_modules/.pnpm/vite-plugin-static-copy@1.0_13f9b3f4f6c727b9da811c30374c48dc/node_modules/vite-plugin-static-copy/dist/index.js";
import livereload from "file:///E:/MyCode/siyuanPlugin/siyuan-douban/node_modules/.pnpm/rollup-plugin-livereload@2.0.5/node_modules/rollup-plugin-livereload/dist/index.cjs.js";
import { svelte } from "file:///E:/MyCode/siyuanPlugin/siyuan-douban/node_modules/.pnpm/@sveltejs+vite-plugin-svelt_03f9c66581acd22d459dc35c94c1b463/node_modules/@sveltejs/vite-plugin-svelte/src/index.js";
import zipPack from "file:///E:/MyCode/siyuanPlugin/siyuan-douban/node_modules/.pnpm/vite-plugin-zip-pack@1.2.4__023d88f9c3a77bb40601f4a3f284e3db/node_modules/vite-plugin-zip-pack/dist/esm/index.mjs";
import fg from "file:///E:/MyCode/siyuanPlugin/siyuan-douban/node_modules/.pnpm/fast-glob@3.3.3/node_modules/fast-glob/out/index.js";

// yaml-plugin.js
import fs from "fs";
import yaml from "file:///E:/MyCode/siyuanPlugin/siyuan-douban/node_modules/.pnpm/js-yaml@4.1.0/node_modules/js-yaml/dist/js-yaml.mjs";
import { resolve } from "path";
function vitePluginYamlI18n(options = {}) {
  const DefaultOptions = {
    inDir: "src/i18n",
    outDir: "dist/i18n"
  };
  const finalOptions = { ...DefaultOptions, ...options };
  return {
    name: "vite-plugin-yaml-i18n",
    buildStart() {
      console.log("\u{1F308} Parse I18n: YAML to JSON..");
      const inDir = finalOptions.inDir;
      const outDir = finalOptions.outDir;
      if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
      }
      const files = fs.readdirSync(inDir);
      for (const file of files) {
        if (file.endsWith(".yaml") || file.endsWith(".yml")) {
          console.log(`-- Parsing ${file}`);
          const jsonFile = file.replace(/\.(yaml|yml)$/, ".json");
          if (files.includes(jsonFile)) {
            console.log(`---- File ${jsonFile} already exists, skipping...`);
            continue;
          }
          try {
            const filePath = resolve(inDir, file);
            const fileContents = fs.readFileSync(filePath, "utf8");
            const parsed = yaml.load(fileContents);
            const jsonContent = JSON.stringify(parsed, null, 2);
            const outputFilePath = resolve(outDir, file.replace(/\.(yaml|yml)$/, ".json"));
            console.log(`---- Writing to ${outputFilePath}`);
            fs.writeFileSync(outputFilePath, jsonContent);
          } catch (error) {
            this.error(`---- Error parsing YAML file ${file}: ${error.message}`);
          }
        }
      }
    }
  };
}

// vite.config.ts
var __vite_injected_original_dirname = "E:\\MyCode\\siyuanPlugin\\siyuan-douban";
var env = process.env;
var isSrcmap = env.VITE_SOURCEMAP === "inline";
var isDev = env.NODE_ENV === "development";
var outputDir = isDev ? "dev" : "dist";
console.log("isDev=>", isDev);
console.log("isSrcmap=>", isSrcmap);
console.log("outputDir=>", outputDir);
var vite_config_default = defineConfig({
  resolve: {
    alias: {
      "@": resolve2(__vite_injected_original_dirname, "src")
    }
  },
  plugins: [
    svelte(),
    vitePluginYamlI18n({
      inDir: "public/i18n",
      outDir: `${outputDir}/i18n`
    }),
    viteStaticCopy({
      targets: [
        { src: "./README*.md", dest: "./" },
        { src: "./plugin.json", dest: "./" },
        { src: "./preview.png", dest: "./" },
        { src: "./icon.png", dest: "./" },
        { src: "./asset/*", dest: "./asset/" }
      ]
    })
  ],
  define: {
    "process.env.DEV_MODE": JSON.stringify(isDev),
    "process.env.NODE_ENV": JSON.stringify(env.NODE_ENV)
  },
  build: {
    outDir: outputDir,
    emptyOutDir: false,
    minify: true,
    sourcemap: isSrcmap ? "inline" : false,
    lib: {
      entry: resolve2(__vite_injected_original_dirname, "src/index.ts"),
      fileName: "index",
      formats: ["cjs"]
    },
    rollupOptions: {
      plugins: [
        ...isDev ? [
          livereload(outputDir),
          {
            name: "watch-external",
            async buildStart() {
              const files = await fg([
                "public/i18n/**",
                "./README*.md",
                "./plugin.json"
              ]);
              for (let file of files) {
                this.addWatchFile(file);
              }
            }
          }
        ] : [
          // Clean up unnecessary files under dist dir
          cleanupDistFiles({
            patterns: ["i18n/*.yaml", "i18n/*.md"],
            distDir: outputDir
          }),
          zipPack({
            inDir: "./dist",
            outDir: "./",
            outFileName: "package.zip"
          })
        ]
      ],
      external: ["siyuan", "process"],
      output: {
        entryFileNames: "[name].js",
        assetFileNames: (assetInfo) => {
          if (assetInfo.name === "style.css") {
            return "index.css";
          }
          return assetInfo.name;
        }
      }
    }
  }
});
function cleanupDistFiles(options) {
  const {
    patterns,
    distDir
  } = options;
  return {
    name: "rollup-plugin-cleanup",
    enforce: "post",
    writeBundle: {
      sequential: true,
      order: "post",
      async handler() {
        const fg2 = await import("file:///E:/MyCode/siyuanPlugin/siyuan-douban/node_modules/.pnpm/fast-glob@3.3.3/node_modules/fast-glob/out/index.js");
        const fs2 = await import("fs");
        const distPatterns = patterns.map((pat) => `${distDir}/${pat}`);
        console.debug("Cleanup searching patterns:", distPatterns);
        const files = await fg2.default(distPatterns, {
          dot: true,
          absolute: true,
          onlyFiles: false
        });
        for (const file of files) {
          try {
            if (fs2.default.existsSync(file)) {
              const stat = fs2.default.statSync(file);
              if (stat.isDirectory()) {
                fs2.default.rmSync(file, { recursive: true });
              } else {
                fs2.default.unlinkSync(file);
              }
              console.log(`Cleaned up: ${file}`);
            }
          } catch (error) {
            console.error(`Failed to clean up ${file}:`, error);
          }
        }
      }
    }
  };
}
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiLCAieWFtbC1wbHVnaW4uanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJFOlxcXFxNeUNvZGVcXFxcc2l5dWFuUGx1Z2luXFxcXHNpeXVhbi1kb3ViYW5cIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIkU6XFxcXE15Q29kZVxcXFxzaXl1YW5QbHVnaW5cXFxcc2l5dWFuLWRvdWJhblxcXFx2aXRlLmNvbmZpZy50c1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vRTovTXlDb2RlL3NpeXVhblBsdWdpbi9zaXl1YW4tZG91YmFuL3ZpdGUuY29uZmlnLnRzXCI7aW1wb3J0IHsgcmVzb2x2ZSB9IGZyb20gXCJwYXRoXCJcclxuaW1wb3J0IHsgZGVmaW5lQ29uZmlnLCBsb2FkRW52IH0gZnJvbSBcInZpdGVcIlxyXG5pbXBvcnQgeyB2aXRlU3RhdGljQ29weSB9IGZyb20gXCJ2aXRlLXBsdWdpbi1zdGF0aWMtY29weVwiXHJcbmltcG9ydCBsaXZlcmVsb2FkIGZyb20gXCJyb2xsdXAtcGx1Z2luLWxpdmVyZWxvYWRcIlxyXG5pbXBvcnQgeyBzdmVsdGUgfSBmcm9tIFwiQHN2ZWx0ZWpzL3ZpdGUtcGx1Z2luLXN2ZWx0ZVwiXHJcbmltcG9ydCB6aXBQYWNrIGZyb20gXCJ2aXRlLXBsdWdpbi16aXAtcGFja1wiO1xyXG5pbXBvcnQgZmcgZnJvbSAnZmFzdC1nbG9iJztcclxuXHJcbmltcG9ydCB2aXRlUGx1Z2luWWFtbEkxOG4gZnJvbSAnLi95YW1sLXBsdWdpbic7XHJcblxyXG5jb25zdCBlbnYgPSBwcm9jZXNzLmVudjtcclxuY29uc3QgaXNTcmNtYXAgPSBlbnYuVklURV9TT1VSQ0VNQVAgPT09ICdpbmxpbmUnO1xyXG5jb25zdCBpc0RldiA9IGVudi5OT0RFX0VOViA9PT0gJ2RldmVsb3BtZW50JztcclxuXHJcbmNvbnN0IG91dHB1dERpciA9IGlzRGV2ID8gXCJkZXZcIiA6IFwiZGlzdFwiO1xyXG5cclxuY29uc29sZS5sb2coXCJpc0Rldj0+XCIsIGlzRGV2KTtcclxuY29uc29sZS5sb2coXCJpc1NyY21hcD0+XCIsIGlzU3JjbWFwKTtcclxuY29uc29sZS5sb2coXCJvdXRwdXREaXI9PlwiLCBvdXRwdXREaXIpO1xyXG5cclxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKHtcclxuICAgIHJlc29sdmU6IHtcclxuICAgICAgICBhbGlhczoge1xyXG4gICAgICAgICAgICBcIkBcIjogcmVzb2x2ZShfX2Rpcm5hbWUsIFwic3JjXCIpLFxyXG4gICAgICAgIH1cclxuICAgIH0sXHJcblxyXG4gICAgcGx1Z2luczogW1xyXG4gICAgICAgIHN2ZWx0ZSgpLFxyXG5cclxuICAgICAgICB2aXRlUGx1Z2luWWFtbEkxOG4oe1xyXG4gICAgICAgICAgICBpbkRpcjogJ3B1YmxpYy9pMThuJyxcclxuICAgICAgICAgICAgb3V0RGlyOiBgJHtvdXRwdXREaXJ9L2kxOG5gXHJcbiAgICAgICAgfSksXHJcblxyXG4gICAgICAgIHZpdGVTdGF0aWNDb3B5KHtcclxuICAgICAgICAgICAgdGFyZ2V0czogW1xyXG4gICAgICAgICAgICAgICAgeyBzcmM6IFwiLi9SRUFETUUqLm1kXCIsIGRlc3Q6IFwiLi9cIiB9LFxyXG4gICAgICAgICAgICAgICAgeyBzcmM6IFwiLi9wbHVnaW4uanNvblwiLCBkZXN0OiBcIi4vXCIgfSxcclxuICAgICAgICAgICAgICAgIHsgc3JjOiBcIi4vcHJldmlldy5wbmdcIiwgZGVzdDogXCIuL1wiIH0sXHJcbiAgICAgICAgICAgICAgICB7IHNyYzogXCIuL2ljb24ucG5nXCIsIGRlc3Q6IFwiLi9cIiB9LFxyXG4gICAgICAgICAgICAgICAgeyBzcmM6IFwiLi9hc3NldC8qXCIsIGRlc3Q6IFwiLi9hc3NldC9cIiB9XHJcbiAgICAgICAgICAgIF0sXHJcbiAgICAgICAgfSksXHJcblxyXG4gICAgXSxcclxuXHJcbiAgICBkZWZpbmU6IHtcclxuICAgICAgICBcInByb2Nlc3MuZW52LkRFVl9NT0RFXCI6IEpTT04uc3RyaW5naWZ5KGlzRGV2KSxcclxuICAgICAgICBcInByb2Nlc3MuZW52Lk5PREVfRU5WXCI6IEpTT04uc3RyaW5naWZ5KGVudi5OT0RFX0VOVilcclxuICAgIH0sXHJcblxyXG4gICAgYnVpbGQ6IHtcclxuICAgICAgICBvdXREaXI6IG91dHB1dERpcixcclxuICAgICAgICBlbXB0eU91dERpcjogZmFsc2UsXHJcbiAgICAgICAgbWluaWZ5OiB0cnVlLFxyXG4gICAgICAgIHNvdXJjZW1hcDogaXNTcmNtYXAgPyAnaW5saW5lJyA6IGZhbHNlLFxyXG5cclxuICAgICAgICBsaWI6IHtcclxuICAgICAgICAgICAgZW50cnk6IHJlc29sdmUoX19kaXJuYW1lLCBcInNyYy9pbmRleC50c1wiKSxcclxuICAgICAgICAgICAgZmlsZU5hbWU6IFwiaW5kZXhcIixcclxuICAgICAgICAgICAgZm9ybWF0czogW1wiY2pzXCJdLFxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgcm9sbHVwT3B0aW9uczoge1xyXG4gICAgICAgICAgICBwbHVnaW5zOiBbXHJcbiAgICAgICAgICAgICAgICAuLi4oaXNEZXYgPyBbXHJcbiAgICAgICAgICAgICAgICAgICAgbGl2ZXJlbG9hZChvdXRwdXREaXIpLFxyXG4gICAgICAgICAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgbmFtZTogJ3dhdGNoLWV4dGVybmFsJyxcclxuICAgICAgICAgICAgICAgICAgICAgICAgYXN5bmMgYnVpbGRTdGFydCgpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGZpbGVzID0gYXdhaXQgZmcoW1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICdwdWJsaWMvaTE4bi8qKicsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgJy4vUkVBRE1FKi5tZCcsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgJy4vcGx1Z2luLmpzb24nXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBdKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZvciAobGV0IGZpbGUgb2YgZmlsZXMpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmFkZFdhdGNoRmlsZShmaWxlKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIF0gOiBbXHJcbiAgICAgICAgICAgICAgICAgICAgLy8gQ2xlYW4gdXAgdW5uZWNlc3NhcnkgZmlsZXMgdW5kZXIgZGlzdCBkaXJcclxuICAgICAgICAgICAgICAgICAgICBjbGVhbnVwRGlzdEZpbGVzKHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgcGF0dGVybnM6IFsnaTE4bi8qLnlhbWwnLCAnaTE4bi8qLm1kJ10sXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGRpc3REaXI6IG91dHB1dERpclxyXG4gICAgICAgICAgICAgICAgICAgIH0pLFxyXG4gICAgICAgICAgICAgICAgICAgIHppcFBhY2soe1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBpbkRpcjogJy4vZGlzdCcsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIG91dERpcjogJy4vJyxcclxuICAgICAgICAgICAgICAgICAgICAgICAgb3V0RmlsZU5hbWU6ICdwYWNrYWdlLnppcCdcclxuICAgICAgICAgICAgICAgICAgICB9KVxyXG4gICAgICAgICAgICAgICAgXSlcclxuICAgICAgICAgICAgXSxcclxuXHJcbiAgICAgICAgICAgIGV4dGVybmFsOiBbXCJzaXl1YW5cIiwgXCJwcm9jZXNzXCJdLFxyXG5cclxuICAgICAgICAgICAgb3V0cHV0OiB7XHJcbiAgICAgICAgICAgICAgICBlbnRyeUZpbGVOYW1lczogXCJbbmFtZV0uanNcIixcclxuICAgICAgICAgICAgICAgIGFzc2V0RmlsZU5hbWVzOiAoYXNzZXRJbmZvKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKGFzc2V0SW5mby5uYW1lID09PSBcInN0eWxlLmNzc1wiKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBcImluZGV4LmNzc1wiXHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBhc3NldEluZm8ubmFtZVxyXG4gICAgICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgfSxcclxuICAgICAgICB9LFxyXG4gICAgfVxyXG59KTtcclxuXHJcblxyXG4vKipcclxuICogQ2xlYW4gdXAgc29tZSBkaXN0IGZpbGVzIGFmdGVyIGNvbXBpbGVkXHJcbiAqIEBhdXRob3IgZnJvc3RpbWVcclxuICogQHBhcmFtIG9wdGlvbnM6XHJcbiAqIEByZXR1cm5zIFxyXG4gKi9cclxuZnVuY3Rpb24gY2xlYW51cERpc3RGaWxlcyhvcHRpb25zOiB7IHBhdHRlcm5zOiBzdHJpbmdbXSwgZGlzdERpcjogc3RyaW5nIH0pIHtcclxuICAgIGNvbnN0IHtcclxuICAgICAgICBwYXR0ZXJucyxcclxuICAgICAgICBkaXN0RGlyXHJcbiAgICB9ID0gb3B0aW9ucztcclxuXHJcbiAgICByZXR1cm4ge1xyXG4gICAgICAgIG5hbWU6ICdyb2xsdXAtcGx1Z2luLWNsZWFudXAnLFxyXG4gICAgICAgIGVuZm9yY2U6ICdwb3N0JyxcclxuICAgICAgICB3cml0ZUJ1bmRsZToge1xyXG4gICAgICAgICAgICBzZXF1ZW50aWFsOiB0cnVlLFxyXG4gICAgICAgICAgICBvcmRlcjogJ3Bvc3QnIGFzICdwb3N0JyxcclxuICAgICAgICAgICAgYXN5bmMgaGFuZGxlcigpIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGZnID0gYXdhaXQgaW1wb3J0KCdmYXN0LWdsb2InKTtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGZzID0gYXdhaXQgaW1wb3J0KCdmcycpO1xyXG4gICAgICAgICAgICAgICAgLy8gY29uc3QgcGF0aCA9IGF3YWl0IGltcG9ydCgncGF0aCcpO1xyXG5cclxuICAgICAgICAgICAgICAgIC8vIFx1NEY3Rlx1NzUyOCBnbG9iIFx1OEJFRFx1NkNENVx1RkYwQ1x1Nzg2RVx1NEZERFx1ODBGRFx1NTMzOVx1OTE0RFx1NTIzMFx1NjU4N1x1NEVGNlxyXG4gICAgICAgICAgICAgICAgY29uc3QgZGlzdFBhdHRlcm5zID0gcGF0dGVybnMubWFwKHBhdCA9PiBgJHtkaXN0RGlyfS8ke3BhdH1gKTtcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUuZGVidWcoJ0NsZWFudXAgc2VhcmNoaW5nIHBhdHRlcm5zOicsIGRpc3RQYXR0ZXJucyk7XHJcblxyXG4gICAgICAgICAgICAgICAgY29uc3QgZmlsZXMgPSBhd2FpdCBmZy5kZWZhdWx0KGRpc3RQYXR0ZXJucywge1xyXG4gICAgICAgICAgICAgICAgICAgIGRvdDogdHJ1ZSxcclxuICAgICAgICAgICAgICAgICAgICBhYnNvbHV0ZTogdHJ1ZSxcclxuICAgICAgICAgICAgICAgICAgICBvbmx5RmlsZXM6IGZhbHNlXHJcbiAgICAgICAgICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgICAgICAgICAvLyBjb25zb2xlLmluZm8oJ0ZpbGVzIHRvIGJlIGNsZWFuZWQgdXA6JywgZmlsZXMpO1xyXG5cclxuICAgICAgICAgICAgICAgIGZvciAoY29uc3QgZmlsZSBvZiBmaWxlcykge1xyXG4gICAgICAgICAgICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChmcy5kZWZhdWx0LmV4aXN0c1N5bmMoZmlsZSkpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHN0YXQgPSBmcy5kZWZhdWx0LnN0YXRTeW5jKGZpbGUpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHN0YXQuaXNEaXJlY3RvcnkoKSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZzLmRlZmF1bHQucm1TeW5jKGZpbGUsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBmcy5kZWZhdWx0LnVubGlua1N5bmMoZmlsZSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhgQ2xlYW5lZCB1cDogJHtmaWxlfWApO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihgRmFpbGVkIHRvIGNsZWFuIHVwICR7ZmlsZX06YCwgZXJyb3IpO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH07XHJcbn1cclxuIiwgImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJFOlxcXFxNeUNvZGVcXFxcc2l5dWFuUGx1Z2luXFxcXHNpeXVhbi1kb3ViYW5cIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIkU6XFxcXE15Q29kZVxcXFxzaXl1YW5QbHVnaW5cXFxcc2l5dWFuLWRvdWJhblxcXFx5YW1sLXBsdWdpbi5qc1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vRTovTXlDb2RlL3NpeXVhblBsdWdpbi9zaXl1YW4tZG91YmFuL3lhbWwtcGx1Z2luLmpzXCI7LypcclxuICogQ29weXJpZ2h0IChjKSAyMDI0IGJ5IGZyb3N0aW1lLiBBbGwgUmlnaHRzIFJlc2VydmVkLlxyXG4gKiBAQXV0aG9yICAgICAgIDogZnJvc3RpbWVcclxuICogQERhdGUgICAgICAgICA6IDIwMjQtMDQtMDUgMjE6Mjc6NTVcclxuICogQEZpbGVQYXRoICAgICA6IC95YW1sLXBsdWdpbi5qc1xyXG4gKiBATGFzdEVkaXRUaW1lIDogMjAyNC0wNC0wNSAyMjo1MzozNFxyXG4gKiBARGVzY3JpcHRpb24gIDogXHU1M0JCXHU1OUFFXHU3MzlCXHU3Njg0IGpzb24gXHU2ODNDXHU1RjBGXHVGRjBDXHU2MjExXHU1QzMxXHU2NjJGXHU4OTgxXHU3NTI4IHlhbWwgXHU1MTk5IGkxOG5cclxuICovXHJcbi8vIHBsdWdpbnMvdml0ZS1wbHVnaW4tcGFyc2UteWFtbC5qc1xyXG5pbXBvcnQgZnMgZnJvbSAnZnMnO1xyXG5pbXBvcnQgeWFtbCBmcm9tICdqcy15YW1sJztcclxuaW1wb3J0IHsgcmVzb2x2ZSB9IGZyb20gJ3BhdGgnO1xyXG5cclxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gdml0ZVBsdWdpbllhbWxJMThuKG9wdGlvbnMgPSB7fSkge1xyXG4gICAgLy8gRGVmYXVsdCBvcHRpb25zIHdpdGggYSBmYWxsYmFja1xyXG4gICAgY29uc3QgRGVmYXVsdE9wdGlvbnMgPSB7XHJcbiAgICAgICAgaW5EaXI6ICdzcmMvaTE4bicsXHJcbiAgICAgICAgb3V0RGlyOiAnZGlzdC9pMThuJyxcclxuICAgIH07XHJcblxyXG4gICAgY29uc3QgZmluYWxPcHRpb25zID0geyAuLi5EZWZhdWx0T3B0aW9ucywgLi4ub3B0aW9ucyB9O1xyXG5cclxuICAgIHJldHVybiB7XHJcbiAgICAgICAgbmFtZTogJ3ZpdGUtcGx1Z2luLXlhbWwtaTE4bicsXHJcbiAgICAgICAgYnVpbGRTdGFydCgpIHtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coJ1x1RDgzQ1x1REYwOCBQYXJzZSBJMThuOiBZQU1MIHRvIEpTT04uLicpO1xyXG4gICAgICAgICAgICBjb25zdCBpbkRpciA9IGZpbmFsT3B0aW9ucy5pbkRpcjtcclxuICAgICAgICAgICAgY29uc3Qgb3V0RGlyID0gZmluYWxPcHRpb25zLm91dERpclxyXG5cclxuICAgICAgICAgICAgaWYgKCFmcy5leGlzdHNTeW5jKG91dERpcikpIHtcclxuICAgICAgICAgICAgICAgIGZzLm1rZGlyU3luYyhvdXREaXIsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAvL1BhcnNlIHlhbWwgZmlsZSwgb3V0cHV0IHRvIGpzb25cclxuICAgICAgICAgICAgY29uc3QgZmlsZXMgPSBmcy5yZWFkZGlyU3luYyhpbkRpcik7XHJcbiAgICAgICAgICAgIGZvciAoY29uc3QgZmlsZSBvZiBmaWxlcykge1xyXG4gICAgICAgICAgICAgICAgaWYgKGZpbGUuZW5kc1dpdGgoJy55YW1sJykgfHwgZmlsZS5lbmRzV2l0aCgnLnltbCcpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coYC0tIFBhcnNpbmcgJHtmaWxlfWApXHJcbiAgICAgICAgICAgICAgICAgICAgLy9cdTY4QzBcdTY3RTVcdTY2MkZcdTU0MjZcdTY3MDlcdTU0MENcdTU0MERcdTc2ODRqc29uXHU2NTg3XHU0RUY2XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QganNvbkZpbGUgPSBmaWxlLnJlcGxhY2UoL1xcLih5YW1sfHltbCkkLywgJy5qc29uJyk7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKGZpbGVzLmluY2x1ZGVzKGpzb25GaWxlKSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhgLS0tLSBGaWxlICR7anNvbkZpbGV9IGFscmVhZHkgZXhpc3RzLCBza2lwcGluZy4uLmApO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgZmlsZVBhdGggPSByZXNvbHZlKGluRGlyLCBmaWxlKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgZmlsZUNvbnRlbnRzID0gZnMucmVhZEZpbGVTeW5jKGZpbGVQYXRoLCAndXRmOCcpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBwYXJzZWQgPSB5YW1sLmxvYWQoZmlsZUNvbnRlbnRzKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QganNvbkNvbnRlbnQgPSBKU09OLnN0cmluZ2lmeShwYXJzZWQsIG51bGwsIDIpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBvdXRwdXRGaWxlUGF0aCA9IHJlc29sdmUob3V0RGlyLCBmaWxlLnJlcGxhY2UoL1xcLih5YW1sfHltbCkkLywgJy5qc29uJykpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhgLS0tLSBXcml0aW5nIHRvICR7b3V0cHV0RmlsZVBhdGh9YCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGZzLndyaXRlRmlsZVN5bmMob3V0cHV0RmlsZVBhdGgsIGpzb25Db250ZW50KTtcclxuICAgICAgICAgICAgICAgICAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmVycm9yKGAtLS0tIEVycm9yIHBhcnNpbmcgWUFNTCBmaWxlICR7ZmlsZX06ICR7ZXJyb3IubWVzc2FnZX1gKTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9LFxyXG4gICAgfTtcclxufVxyXG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQXNTLFNBQVMsV0FBQUEsZ0JBQWU7QUFDOVQsU0FBUyxvQkFBNkI7QUFDdEMs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
