#!/usr/bin/env node

import childProcess from "child_process";
import fs from "fs";
import parse from "git-url-parse";
import meow from "meow";
import path from "path";
import { findGitHubToken, renderInk } from "src/Search";
import tar from "tar";
import tmp from "tmp";
import { fetch } from "./fetch";
import which from "which";

// let editorsToTry = ["code", "subl", "code-insiders", "vim", "vi"];
let editorsToTry = ["code", "subl", "vim", "vi", "code-insiders"];

if (typeof Promise.any !== "function") {
  require("promise-any-polyfill");
}

// This will break if the github repo is called pull or if the organization is called pull
function isPullRequest(url: string) {
  if (!url.includes("github.com") || !url.includes("/pull/")) {
    return false;
  }

  return true;
}

async function resolveRefFromPullRequest(url: string) {
  let _url = url.replace("https://github.com", "");
  const [__, owner, repo, _, pullRequestID] = _url.split("/");

  const apiURL = `https://api.github.com/repos/${owner}/${repo}/pulls/${pullRequestID}`;

  const result = await githubFetch(apiURL);
  if (!result.ok) {
    console.error(
      "Failed to load pull request url: HTTP ",
      result.status,
      "\n",
      await result.text()
    );
    process.exit();
  }

  const json = await result.json();

  const { label, sha } = json.head;
  return [label.split(":")[0], repo, sha];
}

let didRemove = false;
let tmpobj;
let slowTask;

let instance: Command;

const followRedirect = {
  redirect: "follow",
};
enum EditorMode {
  unknown = 0,
  vscode = 1,
  sublime = 2,
  vim = 3,
}

function githubFetch(url, options = null) {
  const token = findGitHubToken();
  if (token && !followRedirect.headers) {
    followRedirect.headers = { authorization: `Bearer ${token}` };
  }
  return fetch(url, followRedirect);
}

function doExit() {
  if (!didRemove) {
    tmpobj?.removeCallback();
    tmpobj = null;
    didRemove = true;
    console.log("🗑  Deleted temp repo");
  }

  if (instance?.archive?.destroy) {
    instance?.archive.destroy();
  }

  if (instance?._tar) {
    instance?._tar.removeAllListeners();
  }

  if (instance?.slowTask) {
    instance.slowTask.removeAllListeners();
    instance.slowTask = null;
  }

  if (instance?.destination?.length && fs.existsSync(instance.destination)) {
    fs.rmSync(instance.destination, {
      recursive: true,
      force: true,
    });
  }
}

process.once("SIGINT", doExit);

class Command {
  log(text) {
    console.log(text);
  }
  destination: string;
  static description =
    "Quickly open a remote Git repository with your local text editor into a temporary folder.";
  static usage = "[git link or github link]";

  static args = [{ name: "url" }];

  didFinish = false;
  async _prefetchGithub(
    repo: string,
    owner: string,
    filepath: string,
    ref: string,
    destination: string
  ) {
    const url = `https://cdn.jsdelivr.net/gh/${owner}/${repo}@${ref}/${
      filepath || "README.md"
    }`;

    const resp = await fetch(url, {
      redirect: "follow",
    });

    if (!resp.ok || resp.status === 404) {
      return false;
    }

    const text = await resp.text();

    if (text.trim().length) {
      await fs.promises.mkdir(path.dirname(destination), { recursive: true });
      await fs.promises.writeFile(destination, text, "utf8");
      return true;
    }

    return false;
  }
  prefetchGithub(
    repo: string,
    owner: string,
    filepath: string,
    ref: string,
    fallback: string,
    destination: string
  ) {
    return Promise.any([
      this._prefetchGithub(repo, owner, filepath, ref, destination),
      this._prefetchGithub(repo, owner, filepath, fallback, destination),
    ]);
  }

  slowTask: childProcess.ChildProcess = null;

  search(input: string) {
    return renderInk(input);
  }

  async _unzip(source: string) {
    const response = await githubFetch(source);
    if (response.ok) {
      return response.body;
    } else {
      throw response.text();
    }
  }
  didUseFallback = false;
  _tar: NodeJS.WritableStream;
  async unzip(owner, name, ref, fallback, to: string) {
    const archive = await this.getArchive(
      `https://api.github.com/repos/${owner}/${name}/tarball/${ref}`,
      `https://api.github.com/repos/${owner}/${name}/tarball/${fallback}`
    );

    this.log("⏳ Extracting repository to temp folder...");
    archive.pipe(
      (this._tar = tar.x({
        cwd: to,
        strip: 1,
        onentry(entry) {},
        onwarn(message, data) {
          console.warn(message);
        },
      }))
    );

    return await new Promise((resolve, reject) => {
      archive.on("end", () => {
        this._tar = null;
        this.log("💿 Finished downloading repository!");
        resolve();
      });
      archive.on("error", (error) => {
        if (didRemove) return;

        this.log("💿 Failed to download repository!");
        reject(error);
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
        $ git-peek [git link or github link or search query or repository file path]

      EXAMPLES
        git peek https://github.com/evanw/esbuild/blob/master/lib/common.ts
        git peek https://github.com/ylukem/pin-go
        git peek https://github.com/jarred-sumner/atbuild
        git peek hanford/trends
        git peek react
        git peek https://github.com/jarred-sumner/fastbench.dev/tree/master/src

      OPTIONS
        -e, --editor=editor  [default: auto] editor to open with, possible values:
                             auto, ${editorsToTry.join(
                               ", "
                             )}. By default, it will search
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
  archive: NodeJS.ReadableStream;
  async getArchive(source: string, fallbackSource: string) {
    let archive: NodeJS.ReadableStream;
    try {
      archive = await this._unzip(source);
    } catch (exception) {
      try {
        this.didUseFallback = true;
        archive = await this._unzip(fallbackSource);
      } catch (exception) {
        console.error(
          `Invalid repository link. Tried:\n-  ${source}\n-  ${fallbackSource}`
        );
        doExit();
        process.exit();
      }
    }

    this.archive = archive;
    return archive;
  }

  async run() {
    const cli = this.parse();
    const { help, version } = cli.flags;
    let url = cli.input[0]?.trim() ?? "";
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

    let link;

    let isMalformed = false;
    if (!url.includes("://") && url.split("/").length === 2) {
      const [owner, repo] = url.split("/");

      if (repo.trim().length) {
        url = `https://github.com/${owner}/${repo}`;
      } else {
        isMalformed = true;
      }
    }

    if (!isMalformed) {
      isMalformed = !url || !url.includes("/") || url.includes(" ");
    }

    while (!link) {
      if (isMalformed) {
        url = await this.search(url);
        isMalformed = !url || !url.includes("/") || url.includes(" ");
      }

      try {
        link = parse(url);
      } catch (exception) {
        try {
          url = await this.search(url);
          isMalformed = !url || !url.includes("/") || url.includes(" ");
        } catch (exception) {
          console.log(exception);
        }
      }
    }

    let ref = link.ref;

    if (!ref) {
      ref = "master";
    }

    if (url && url.length && isPullRequest(url)) {
      const [newOwner, newName, newRef] = await resolveRefFromPullRequest(url);
      link.name = newName;
      link.owner = newOwner;
      ref = newRef;
    }

    const start = new Date().getTime();

    tmpobj = tmp.dirSync({
      unsafeCleanup: true,
    });
    this.destination = tmpobj.name;

    didRemove = false;
    process.once("beforeExit", doExit);
    process.once("SIGABRT", doExit);
    process.once("SIGQUIT", doExit);

    let specificFile = link.filepath;

    if (!specificFile) {
      specificFile = "README.md";
    }

    let openPath = path.join(tmpobj.name, specificFile);

    // From a simple benchmark, unzip is 2x faster than git clone.
    if (link.resource === "github.com") {
      let fallback = ref === "main" ? "master" : "main";

      await Promise.any([
        this.prefetchGithub(
          link.name,
          link.owner,
          specificFile,
          ref,
          fallback,
          openPath
        ).catch(console.error),
        this.unzip(link.owner, link.name, ref, fallback, tmpobj.name),
      ]);
    } else {
      await this.clone(link.href, tmpobj.name);
    }

    let chosenEditor =
      !_editor || _editor === "auto" ? process.env.EDITOR : _editor;

    if (!chosenEditor?.trim().length) {
      for (let editor of editorsToTry) {
        try {
          chosenEditor = await which(editor);
          if (chosenEditor.includes("code") || chosenEditor.includes("subl")) {
            chosenEditor = `"` + chosenEditor + `"`;
          }
          break;
        } catch (exception) {}
      }
    }

    if (!chosenEditor || !chosenEditor?.trim()?.length) {
      console.warn(
        "No editor detected, defaulting to Visual Studio Code. Set an editor with the -e flag"
      );
      chosenEditor = "code";
    }

    let editorSpecificCommands = [];

    // console.log(path.join(tmpobj.name, specificFile));

    let editorMode = EditorMode.unknown;

    if (chosenEditor.includes("code")) {
      chosenEditor += " --wait";
      editorMode = EditorMode.vscode;
      editorSpecificCommands.push("--new-window");

      if (specificFile) {
        editorSpecificCommands.push(`-g "${path.resolve(openPath)}":0:0`);
      }
    } else if (chosenEditor.includes("subl")) {
      chosenEditor += " --wait";
      editorMode = EditorMode.sublime;
      editorSpecificCommands.push("--new-window");

      if (specificFile) {
        editorSpecificCommands.push(`"${path.resolve(openPath)}":0:0`);
      }
      // TODO: handle go to specific line for vim.
    } else if (chosenEditor.includes("vi")) {
      editorMode = EditorMode.vim;
    }

    await new Promise((resolve, reject) => {
      if (editorMode === EditorMode.vim) {
        process.stdin.setRawMode(true);
        process.stdin.pause();

        this.slowTask = childProcess.spawn(
          chosenEditor,
          [tmpobj.name, ...editorSpecificCommands],
          {
            env: process.env,
            stdio: "inherit",
            detached: false,
            cwd: tmpobj.name,
          }
        );
        let didResolve = false;
        function resolver() {
          if (!didResolve) {
            process.stdin.setRawMode(false);
            process.stdin.resume();

            resolve();
            didResolve = true;
          }
        }

        this.slowTask.once("close", resolver);
        this.slowTask.once("exit", resolver);
        this.slowTask.once("error", resolver);
      } else {
        const cmd = `${chosenEditor} "${path.join(
          tmpobj.name
        )}" ${editorSpecificCommands.join(" ")}`.trim();

        this.slowTask = childProcess.exec(
          cmd,
          {
            env: process.env,
            stdio: "inherit",
            cwd: tmpobj.name,
          },
          (err, res) => (err ? reject(err) : resolve(res))
        );
      }

      this.log(
        `💻 Launched editor in ${(
          (new Date().getTime() - start) /
          1000
        ).toFixed(2)}s`
      );
    });

    doExit();
    process.exit();
  }
}

process.on("unhandledRejection", (reason) => console.error(reason));
process.on("unhandledException", (reason) => console.error(reason));
instance = new Command();
instance.run();
