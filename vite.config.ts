import path from "path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type Plugin } from "vite";
import JavaScriptObfuscator from "javascript-obfuscator";

function productionObfuscationPlugin(): Plugin {
  return {
    name: "quran-glass-production-obfuscation",
    apply: "build" as const,
    enforce: "post" as const,
    generateBundle(_options, bundle) {
      for (const item of Object.values(bundle)) {
        if (item.type !== "chunk" || !item.fileName.endsWith(".js")) continue;
        // NOTE: debugProtection/selfDefending were previously enabled here. Both are
        // active anti-debugging tricks (freezing the tab via a debugger loop when
        // devtools is open, and re-checking/re-obfuscating themselves at runtime).
        // They match the exact "disable devtools as a security boundary" anti-pattern
        // this project explicitly avoids elsewhere, and are a common source of frozen
        // tabs / broken functionality for ordinary users. Obfuscation here stays as a
        // non-invasive, additional layer (renaming + string-array encoding) — never a
        // security boundary — per the project's security requirements.
        const result = JavaScriptObfuscator.obfuscate(item.code, {
          compact: true,
          controlFlowFlattening: false,
          deadCodeInjection: false,
          debugProtection: false,
          disableConsoleOutput: true,
          identifierNamesGenerator: "hexadecimal",
          rotateStringArray: true,
          selfDefending: false,
          simplify: true,
          splitStrings: false,
          stringArray: true,
          stringArrayEncoding: ["base64"],
          stringArrayThreshold: 0.45,
          target: "browser",
        });
        item.code = result.getObfuscatedCode();
        item.map = null;
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  const isProduction = mode === "production";
  return {
    plugins: [
      react({
        babel: {
          plugins: isProduction
            ? []
            : [
                // Development-only source markers for preview tooling; never shipped in production.
                "./scripts/babel-plugin-jsx-source-location.cjs",
              ],
        },
      }),
      tailwindcss(),
      ...(isProduction ? [productionObfuscationPlugin()] : []),
    ],
    resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
    base: "./",
    build: {
      outDir: "dist",
      emptyOutDir: true,
      sourcemap: false,
      minify: "terser",
      cssMinify: true,
      reportCompressedSize: false,
      terserOptions: {
        compress: {
          drop_console: true,
          drop_debugger: true,
          passes: 2,
        },
        format: { comments: false },
      },
      rollupOptions: {
        output: {
          manualChunks: undefined,
        },
      },
    },
  };
});
