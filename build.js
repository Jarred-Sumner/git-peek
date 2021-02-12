const { build } = require("esbuild");

build({
  bundle: true,
  target: ["node12"],
  entryPoints: ["./src/index.ts"],
  outfile: "./bin/git-peek",
  platform: "node",
  external: ["path", "fs", "child_process"],
  minify: true,
}).then((a) => console.log("Built.", a.warnings, a.outputFiles));
