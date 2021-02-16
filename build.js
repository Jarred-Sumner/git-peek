const { build } = require("esbuild");
const path = require("path");

const globalExternals = [
  "path",
  "fs",
  "child_process",
  "register-url-win64-bin-uac",
  "register-url-win64-bin",
];

const codeSplitFiles = [
  "src/confirmPrompt",
  "src/Search",
  "src/registerProtocol",
];

const PKG_DEFINES = {
  SEARCH_PATH: "'src/Search'",
  REGISTER_PROTOCOL_PATH: "'src/registerProtocol'",
  CONFIRM_PROMPT_PATH: "'src/confirmPrompt'",
};
const REGULAR_DEFINES = {
  SEARCH_PATH: "_SEARCH_PATH",
  REGISTER_PROTOCOL_PATH: "_REGISTER_PROTOCOL_PATH",
  CONFIRM_PROMPT_PATH: "_CONFIRM_PROMPT_PATH",
};

const minify = true;

async function run() {
  for (let file of codeSplitFiles) {
    await build({
      bundle: true,
      target: ["node12"],
      entryPoints: [file],
      outfile: "./bin/" + path.basename(file) + ".js",
      platform: "node",
      sourcemap: "external",
      external: [...globalExternals],
      minify,
    }).then((a) => console.log("Built.", a.outputFiles));
  }

  await build({
    bundle: true,
    target: ["node12"],
    entryPoints: ["./src/index.ts"],
    outfile: "./bin/git-peek",
    platform: "node",
    sourcemap: "external",
    external: [...globalExternals, ...codeSplitFiles],
    define: REGULAR_DEFINES,
    minify,
  }).then((a) => console.log("Built.", a.outputFiles));
}

build({
  bundle: true,
  target: ["node12"],
  entryPoints: ["./src/index.ts"],
  outfile: "./pkgbin/git-peek",
  platform: "node",
  sourcemap: "external",
  external: [...globalExternals],
  define: PKG_DEFINES,
  minify,
}).then((a) => console.log("Built.", a.outputFiles));

run();
