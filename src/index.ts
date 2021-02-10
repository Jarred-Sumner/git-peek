#!/usr/bin/env node

import createFetcher from "@vercel/fetch";
import childProcess from "child_process";
import fs from "fs";
import parse from "git-url-parse";
import * as _fetch from "node-fetch";
import path from "path";
import tmp from "tmp";
import meow from "meow";

const fetch = createFetcher(_fetch);

if (typeof Promise.any !== "function") {
  require("promise-any-polyfill");
}

const start = new Date().getTime();

class Command {
  log(text) {
    console.log(text);
  }
  static description =
    "Quickly open a remote Git repository with your local text editor into a temporary folder.";
  static usage = "[git link or github link]";

  static args = [{ name: "url" }];

  didFinish = false;
  async prefetchGithub(
    repo: string,
    owner: string,
    filepath: string,
    ref: string,
    destination: string
  ) {
    const url = `https://cdn.jsdelivr.net/gh/${owner}/${repo}@${ref}/${
      filepath || "README.md"
    }`;

    const text = await (await fetch(url)).text();

    if (text.trim().length) {
      await fs.promises.mkdir(path.dirname(destination), { recursive: true });
      await fs.promises.writeFile(destination, text, "utf8");
      return true;
    }

    return false;
  }

  slowTask: childProcess.ChildProcess = null;

  unzip(source: string, to: string) {
    const git = `cd "${to}"; wget ${source} -O git.zip && bsdtar --strip-components=1 -xvf git.zip && rm git.zip`;
    this.log(`Downloading ${source} to temp folder...`);
    return new Promise((resolve, reject) => {
      this.didFinish = false;
      const child = childProcess.exec(git);
      child.stdout.unpipe(process.stdout);
      child.stderr.pipe(process.stderr);
      this.slowTask = child;
      child.once("close", () => {
        this.didFinish = true;
        this.slowTask = null;
        resolve();
      });

      child.once("exit", () => {
        this.slowTask = null;
        this.didFinish = true;
        resolve();
      });

      child.once("error", (err) => {
        this.slowTask = null;
        this.didFinish = true;
        reject(err);
      });
    });
  }

  clone(source: string, to: string) {
    const git = `git clone --filter=tree:0 --single-branch --depth=1 ${source} ${to}`;
    this.log(`Cloning ${source} to temp folder...`);
    return new Promise((resolve, reject) => {
      const child = childProcess.exec(git, {});
      child.stderr.pipe(process.stderr);
      child.once("close", () => {
        resolve();
      });

      child.once("exit", () => {
        resolve();
      });

      child.once("error", (err) => {
        reject(err);
      });
    });
  }

  parse() {
    const cli = meow(
      `
      USAGE
        $ git-peek [git link or github link]

      EXAMPLES
        git peek https://github.com/evanw/esbuild/blob/master/lib/common.ts
        git peek https://github.com/ylukem/pin-go
        git peek https://github.com/jarred-sumner/atbuild

      OPTIONS
        -e, --editor=editor  [default: auto] editor to open with, possible values:
                             auto, code, vim, subl. By default, it will search
                             $EDITOR. If not found, it will try code, then subl,
                             then vim.

        -h, --help           show CLI help

    `.trim() + "\n",
      {
        flags: {
          help: {
            type: "boolean",
            default: false,
            alias: "h",
            isRequired: false,
          },
          version: {
            type: "boolean",
            default: false,
            alias: "v",
            isRequired: false,
          },
          editor: {
            type: "string",
            isMultiple: false,
            isRequired: false,
            default: "auto",
            alias: "e",
            description: `editor to open with, possible values: auto, code, vim, subl. By default, it will search $EDITOR. If not found, it will try code, then subl, then vim.`,
          },
        },
      }
    );

    return cli;
  }

  async run() {
    const cli = this.parse();
    const { help, version } = cli.flags;
    const url = cli.input[0];
    if (help) {
      cli.showHelp(0);
      process.exit(0);
    }

    if (version) {
      cli.showVersion();
      process.exit(0);
    }

    const {
      flags: { editor: _editor = "auto" },
    } = cli;

    if (!url || !url.trim().length) {
      this.log(`🔗❓ No link. Please paste a git link or a github link.\n`);
      this.log(
        "For example:\n   git peek https://github.com/evanw/esbuild/blob/master/lib/common.ts"
      );
      process.exit(1);
      return;
    }

    let link;

    try {
      link = parse(url);
    } catch (exception) {
      this.log(
        `🔗❓ Invalid link. Please paste a git link or a github link.\n`
      );
      this.log(
        "For example:\n   git peek https://github.com/evanw/esbuild/blob/master/lib/common.ts"
      );
      process.exit(1);
      return;
    }

    let tmpobj = tmp.dirSync({
      unsafeCleanup: true,
    });

    let didRemove = false;
    process.on("beforeExit", () => {
      if (!didRemove) {
        tmpobj.removeCallback();
        didRemove = true;
        this.log("🗑 Deleted temp repo");
      }

      if (this.slowTask) {
        this.slowTask.kill("SIGHUP");
        this.slowTask = null;
      }
    });
    let ref = link.ref;

    if (!ref) {
      ref = "main";
    }

    let specificFile = link.filepath;

    if (!specificFile) {
      specificFile = "README.md";
    }

    let openPath = path.join(tmpobj.name, specificFile);

    let definitelyWait = null;
    // From a simple benchmark, unzip is 2x faster than git clone.
    if (link.resource === "github.com") {
      await Promise.any([
        this.prefetchGithub(
          link.name,
          link.owner,
          specificFile,
          ref,
          openPath
        ).catch(console.error),
        (definitelyWait = this.unzip(
          `https://github.com/${link.owner}/${link.name}/zipball/${ref}`,
          tmpobj.name
        )),
      ]);
    } else {
      await this.clone(link.href, tmpobj.name);
    }

    let chosenEditor =
      !_editor || _editor === "auto" ? process.env.EDITOR : _editor;

    if (!chosenEditor?.trim().length) {
      let editorsToTry = ["code", "subl", "vim"];

      for (let editor of editorsToTry) {
        try {
          chosenEditor = childProcess
            .execSync(`which ${editor}`)
            .toString()
            .trim();
          chosenEditor += " --wait";
          break;
        } catch (exception) {}
      }
    }

    let editorSpecificCommands = [];

    // console.log(path.join(tmpobj.name, specificFile));

    if (chosenEditor.includes("code")) {
      editorSpecificCommands.push("--new-window");

      if (specificFile) {
        editorSpecificCommands.push(`-g "${path.resolve(openPath)}":0:0`);
      }
    } else if (chosenEditor.includes("subl")) {
      editorSpecificCommands.push("--new-window");

      if (specificFile) {
        editorSpecificCommands.push(`"${path.resolve(openPath)}":0:0`);
      }
    }

    const cmd = `${chosenEditor} "${path.join(
      tmpobj.name
    )}" ${editorSpecificCommands.join(" ")}`.trim();
    this.log(
      `--\n💻 Launched editor in ${(
        (new Date().getTime() - start) /
        1000
      ).toFixed(2)}s\n--`
    );

    await new Promise((resolve, reject) => {
      childProcess.exec(
        cmd,
        {
          env: process.env,
          stdio: "inherit",
          cwd: tmpobj.name,
        },
        (err, res) => (err ? reject(err) : resolve(res))
      );
    });

    if (this.slowTask) {
      this.slowTask.kill("SIGHUP");
      this.slowTask = null;
    }

    tmpobj.removeCallback();
    didRemove = true;
    this.log("\n✅ Deleted temp repo");
    process.exit(0);
  }
}

new Command().run();
