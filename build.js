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
    minify,
  }).then((a) => console.log("Built.", a.outputFiles));
}

run();
