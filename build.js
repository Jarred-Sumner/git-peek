const { build } = require("esbuild");

build({
  bundle: true,
  target: ["node12"],
  entryPoints: ["./src/index.ts"],
  outfile: "./bin/git-peek",
  platform: "node",
  sourcemap: "external",
  external: [
    "path",
    "fs",
    "child_process",
    "register-url-win64-bin-uac",
    "register-url-win64-bin",
  ],
  minify: true,
}).then((a) => console.log("Built.", a.outputFiles));
