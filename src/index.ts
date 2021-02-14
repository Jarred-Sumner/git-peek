#!/usr/bin/env node

import childProcess from "child_process";
import fs from "fs";
import parse from "git-url-parse";
import meow from "meow";
import path from "path";
import { findGitHubToken } from "src/findGitHubToken";
import tar from "tar";
import tmp from "tmp";
import { fetch } from "./fetch";
import which from "which";
import dotenv from "dotenv";
import type { Writable } from "stream";

const HOME =
  process.platform === "win32"
    ? path.join(process.env.HOMEDRIVE, process.env.HOMEPATH)
    : process.env.HOME;

const GIT_PEEK_ENV_PATH = path.join(HOME, ".git-peek");
let editorsToTry = ["code", "subl", "code-insiders", "vim", "vi"];

let shouldKeep = false;

let logFunction = console.log;
let exceptionLogger = console.error;

// fs.rmSync was added in Node v14.14
// See docs: https://nodejs.org/api/fs.html#fs_fs_rmsync_path_options
if (!fs.rmSync) {
  const rimraf = require("rimraf");
  fs.rmSync = (path: string, options: fs.RmOptions) => {
    // Just in-case!
    if (path === "/") return;
    if (path === "/Applications") return;
    return rimraf.sync(path);
  };
}

async function fetchEditor(_editor, silent) {
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
    if (!silent)
      console.warn(
        "No editor detected, defaulting to Visual Studio Code. Set an editor with the -e flag"
      );
    chosenEditor = "code";
  }

  return chosenEditor;
}

const DOTENV_EXISTS = fs.existsSync(GIT_PEEK_ENV_PATH);

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

async function resolveRefFromURL(owner: string, repo: string) {
  const apiURL = `https://api.github.com/repos/${owner}/${repo}`;

  const result = await githubFetch(apiURL);
  if (!result.ok) {
    console.error(
      "Failed to load github url: HTTP ",
      result.status,
      "\n",
      await result.text()
    );
    process.exit();
  }

  const json = await result.json();

  return json.default_branch ?? "main";
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
  const wasDidRemove = didRemove;

  if (!didRemove && !shouldKeep) {
    tmpobj?.removeCallback();
    tmpobj = null;
    didRemove = false;
    instance?.log("🗑  Deleted temp repo");
  }

  if (instance?.archive?.destroy) {
    instance?.archive.destroy();
  }

  if (instance?._tar) {
    instance?._tar.abort("none");
    instance?._tar.removeAllListeners();
  }

  if (instance?.slowTask) {
    if (!instance.slowTask.killed) {
      instance.slowTask.kill("SIGKILL");
    }

    instance.slowTask.removeAllListeners();

    instance.slowTask = null;
  }

  if (
    !wasDidRemove &&
    !shouldKeep &&
    instance?.destination?.length &&
    fs.existsSync(instance.destination)
  ) {
    fs.rmSync(instance.destination, {
      recursive: true,
      force: true,
    });
  }
}

process.once("SIGINT", doExit);

class Command {
  log(text) {
    if (this.editorMode === EditorMode.vim && this.slowTask) return;
    console.log(text);
  }

  editorMode: EditorMode = EditorMode.unknown;
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

    throw "nope";
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
    // TODO: remove this when https://github.com/vadimdemedes/ink/issues/415 is resolved.
    const _disableWarning = process.emitWarning;
    process.emitWarning = () => {};
    const { renderInk } = require("./Search");
    process.emitWarning = _disableWarning;

    return renderInk(input);
  }

  async _unzip(source: string) {
    const response = await githubFetch(source);
    if (response.ok) {
      return response.body;
    } else if (response.status === 403 || response.status === 401) {
      const error = `Failed to load git repo: HTTP ${response.status}
${await response.text()}
-
If this is a private repo, consider setting $GITHUB_TOKEN. To save $GITHUB_TOKEN, store it in $HOME/.git-peek (a .env file)`;
      console.error(error);
      throw error;
    } else {
      throw await response.text();
    }
  }
  didUseFallback = false;
  _tar: Writable;
  unzipPromise: Promise<any>;
  unzip(owner, name, ref, fallback, to: string) {
    return new Promise((resolve2, reject2) => {
      this.unzipPromise = new Promise(async (resolve, reject) => {
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

        archive.on("end", () => {
          this._tar = null;
          this.log("💿 Finished downloading repository!");
          resolve();
          resolve2();
        });
        archive.on("error", (error) => {
          this._tar = null;
          if (didRemove) return;

          this.log("💿 Failed to download repository!");
          reject(error);
          reject2(error);
        });
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
  git peek https://github.com/jarred-sumner/fastbench.dev/tree/main/

OPTIONS
  -e, --editor=editor  [default: ${
    process.env.EDITOR?.length ? process.env.EDITOR : "auto"
  }] editor to open with, possible values:
                        auto, ${editorsToTry.join(", ")}.
                        By default, it will search $EDITOR. If not found, it
                        will try code, then subl, then vim.

  -d                    [default: false] Ask the GitHub API
                        for the default_branch to clone.

  -r, --register        [default: false] Register the git-peek:// url protocol
                        This allows the "Open" buttons to work on
                        github.com once you've installed the extension. Only
                        supported on macOS (Windows coming soon).

  -w, --wait           [default: false] wait to open the editor until the
                        repository finishes downloading. always on for vi.

  -no-keep             [default: false] skip deleting repository on exit.

  -b, --branch         [default: "master"] select a branch/ref to use.
                       if the repository doesn't use master/main,
                       you'll want to set this manually. but it will
                       try to infer from the input by default.

  -o, --out=           [default: system temp directory] output directory to
                       store repository files in. If you're cloning a large
                       repo and your tempdir is an in-memory storage (/tmp),
                       maybe change this.

  -h, --help           show CLI help

ENVIRONMENT VARIABLES:
  $EDITOR: ${process.env.EDITOR?.length ? process.env.EDITOR : "not set"}
  $GITHUB_TOKEN: ${
    process.env.GITHUB_TOKEN?.length
      ? new Array(process.env.GITHUB_TOKEN.length).fill("*").join("")
      : "not set"
  }
  .env: ${DOTENV_EXISTS ? "✅" : "❌"} ${GIT_PEEK_ENV_PATH}

For use with private GitHub repositories, set $GITHUB_TOKEN to a personal
access token. To persist it, store it in your shell or the .env shown above.
`.trim(),
      {
        flags: {
          fromscript: {
            type: "boolean",
            default: false,
          },
          register: {
            type: "boolean",
            default: false,
            alias: "r",
            description: "Register protocol handler",
          },
          confirm: {
            type: "boolean",
            default: false,
            alias: "c",
            description: "Confirm before deleting",
          },
          out: {
            type: "string",
            default: "",
            alias: "o",
            description:
              "Parent directory to store the repository in. Defaults to system temp folder.",
          },
          branch: {
            type: "string",
            default: "",
            alias: "b",
            description: "branch/ref to use when fetching",
          },
          defaultBranch: {
            type: "boolean",
            default: false,
            alias: "d",
            description: "Check default branch",
          },
          keep: {
            type: "boolean",
            default: false,
            alias: "k",
            description: "Don't delete the repository on exit.",
          },
          wait: {
            type: "boolean",
            default: false,
            alias: "w",
            description:
              "Wait for the repository to completely download before opening. Defaults to false, unless its vim. Then its always true.",
          },
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
    const {
      help,
      version,
      out: tempBaseDir,
      branch,
      defaultBranch,
      register,
    } = cli.flags;

    shouldKeep = cli.flags.keep;

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

    if (register) {
      await require("./registerProtocol").register(
        await fetchEditor(_editor, false)
      );
      return;
    }

    let url = cli.input[0]?.trim() ?? "";
    let alwaysConfirm = cli.flags.confirm;

    if (url.includes("git-peek://")) {
      url = url.replace("git-peek://", "").trim();
    }

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
          this.log(exception);
        }
      }
    }

    let ref = link.ref;

    if (
      link.resource === "github.com" &&
      (branch === "default" ||
        defaultBranch ||
        (branch === "" && cli.flags.fromscript))
    ) {
      ref = await resolveRefFromURL(link.owner, link.name);
    } else if (branch !== "") {
      ref = branch;
    } else if (!ref) {
      ref = "master";
    }

    if (url && url.length && isPullRequest(url)) {
      const [newOwner, newName, newRef] = await resolveRefFromPullRequest(url);
      link.name = newName;
      link.owner = newOwner;
      ref = newRef;
    }

    const start = new Date().getTime();

    tmpobj = tmp.dirSync(
      tempBaseDir?.length
        ? {
            unsafeCleanup: true,
            keep: shouldKeep,
            tmpdir: path.resolve(process.cwd(), tempBaseDir),
          }
        : { unsafeCleanup: true, keep: shouldKeep }
    );
    this.destination = tmpobj.name;

    didRemove = false;
    process.once("beforeExit", doExit);
    process.once("SIGABRT", doExit);
    process.once("SIGQUIT", doExit);

    let specificFile = link.filepath;
    let usingDefaultFile = !specificFile;

    if (usingDefaultFile) {
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

    let chosenEditor = await fetchEditor(_editor, false);

    let editorSpecificCommands = [];

    // console.log(path.join(tmpobj.name, specificFile));

    this.editorMode = EditorMode.unknown;

    if (chosenEditor.includes("code")) {
      if (!chosenEditor.includes("wait")) chosenEditor += " --wait";
      this.editorMode = EditorMode.vscode;
      editorSpecificCommands.push("--new-window");

      if (specificFile) {
        editorSpecificCommands.push(`-g "${path.resolve(openPath)}":0:0`);
      }
    } else if (chosenEditor.includes("subl")) {
      if (!chosenEditor.includes("wait")) chosenEditor += " --wait";

      this.editorMode = EditorMode.sublime;
      editorSpecificCommands.push("--new-window");

      if (specificFile) {
        editorSpecificCommands.push(`"${path.resolve(openPath)}":0:0`);
      }
      // TODO: handle go to specific line for vim.
    } else if (chosenEditor.includes("vi")) {
      this.editorMode = EditorMode.vim;
    }

    if (
      (this.editorMode === EditorMode.vim && usingDefaultFile) ||
      cli.flags.wait
    )
      if (this.unzipPromise) await this.unzipPromise;

    await new Promise((resolve, reject) => {
      if (this.editorMode === EditorMode.vim) {
        process.stdin.setRawMode(true);
        process.stdin.pause();

        this.slowTask = childProcess.spawn(
          chosenEditor,
          [
            usingDefaultFile ? tmpobj.name : specificFile,
            ...editorSpecificCommands,
          ],
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
        this.log(
          `💻 Launched editor in ${(
            (new Date().getTime() - start) /
            1000
          ).toFixed(2)}s`
        );

        const cmd = `${chosenEditor} "${path.join(
          tmpobj.name
        )}" ${editorSpecificCommands.join(" ")}`.trim();

        this.slowTask = childProcess.spawn(cmd, {
          env: process.env,
          shell: true,
          stdio: cli.flags.fromscript ? "ignore" : "inherit",
          detached: true,
          cwd: tmpobj.name,
        });
        let didResolve = false;

        function resolver() {
          if (!didResolve) {
            process.stdin.setRawMode(false);
            process.stdin.resume();

            resolve();
            didResolve = true;
          }
        }

        this.slowTask.once("exit", resolver);
        this.slowTask.once("error", reject);
      }
    });

    if (shouldKeep) {
      didRemove = true;
    } else if (this.editorMode === EditorMode.unknown || alwaysConfirm) {
      // TODO: remove this when https://github.com/vadimdemedes/ink/issues/415 is resolved.
      const _disableWarning = process.emitWarning;
      process.emitWarning = () => {};
      const { renderConfirm } = require("src/confirmPrompt");
      process.emitWarning = _disableWarning;
      const shouldRemove = await renderConfirm();
      shouldKeep = didRemove = !shouldRemove;
    }

    doExit();
    process.exit();
    setTimeout(() => {
      process.emitWarning = () => {};
      process.kill(process.pid, "SIGTERM");
    }, 1000);
  }
}

process.on("unhandledRejection", exceptionLogger);
process.on("unhandledException", exceptionLogger);

if (DOTENV_EXISTS) {
  dotenv.config({ path: GIT_PEEK_ENV_PATH });
}

instance = new Command();
instance.run();
