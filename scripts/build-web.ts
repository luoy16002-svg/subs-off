// Builds the static front end into public/: hashed JS and CSS bundles,
// self-hosted fonts copied from @fontsource, and index.html pointing at them.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pub = join(root, "public");
const assets = join(pub, "assets");
const fonts = join(pub, "fonts");

const FONT_FILES: Array<[pkg: string, file: string]> = [
  ["@fontsource-variable/geist", "geist-latin-wght-normal.woff2"],
  ["@fontsource-variable/geist", "geist-latin-ext-wght-normal.woff2"],
  ["@fontsource-variable/bricolage-grotesque", "bricolage-grotesque-latin-wght-normal.woff2"],
  ["@fontsource-variable/bricolage-grotesque", "bricolage-grotesque-latin-ext-wght-normal.woff2"],
  ["@fontsource-variable/geist-mono", "geist-mono-latin-wght-normal.woff2"],
];

function copyFonts() {
  mkdirSync(fonts, { recursive: true });
  for (const [pkg, file] of FONT_FILES) {
    const source = join(root, "node_modules", pkg, "files", file);
    if (!existsSync(source)) throw new Error(`Missing font file ${source}. Run npm install.`);
    copyFileSync(source, join(fonts, file));
  }
}

function writeHtml(metafile: esbuild.Metafile) {
  const outputs = Object.keys(metafile.outputs).map((file) => `/${relative(pub, join(root, file)).replace(/\\/g, "/")}`);
  const js = outputs.find((file) => /\/app-[A-Z0-9]+\.js$/i.test(file));
  const css = outputs.find((file) => /\/styles-[A-Z0-9]+\.css$/i.test(file));
  if (!js || !css) throw new Error(`Build outputs not found: ${outputs.join(", ")}`);
  const template = readFileSync(join(root, "web", "index.html"), "utf8");
  writeFileSync(join(pub, "index.html"), template.replace("%CSS%", css).replace("%JS%", js));
}

const htmlPlugin: esbuild.Plugin = {
  name: "html",
  setup(build) {
    build.onStart(() => {
      if (existsSync(assets)) for (const file of readdirSync(assets)) rmSync(join(assets, file), { force: true });
    });
    build.onEnd((result) => {
      if (result.errors.length === 0 && result.metafile) writeHtml(result.metafile);
    });
  },
};

export function webBuildOptions(minify: boolean): esbuild.BuildOptions {
  return {
    absWorkingDir: root,
    entryPoints: { app: "web/main.tsx", styles: "web/styles.css" },
    outdir: "public/assets",
    entryNames: "[name]-[hash]",
    bundle: true,
    format: "esm",
    target: ["es2020", "chrome100", "safari15", "firefox100"],
    jsx: "automatic",
    jsxImportSource: "preact",
    minify,
    sourcemap: minify ? false : "linked",
    metafile: true,
    external: ["/fonts/*"],
    define: { "process.env.NODE_ENV": JSON.stringify(minify ? "production" : "development") },
    legalComments: "none",
    logLevel: "warning",
    plugins: [htmlPlugin],
  };
}

export async function buildWeb(options: { minify?: boolean } = {}) {
  mkdirSync(assets, { recursive: true });
  copyFonts();
  const result = await esbuild.build(webBuildOptions(options.minify ?? true));
  const sizes = Object.entries(result.metafile!.outputs)
    .filter(([file]) => !file.endsWith(".map"))
    .map(([file, meta]) => `${relative(root, join(root, file))} ${(meta.bytes / 1024).toFixed(1)} KB`);
  console.log(`Built front end:\n  ${sizes.join("\n  ")}`);
}

export async function watchWeb() {
  mkdirSync(assets, { recursive: true });
  copyFonts();
  const ctx = await esbuild.context(webBuildOptions(false));
  await ctx.rebuild();
  await ctx.watch();
  return ctx;
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  buildWeb().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
