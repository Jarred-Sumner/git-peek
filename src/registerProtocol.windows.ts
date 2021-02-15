import chalk from "chalk";
import {
  register as _register,
  BINARY_VERSION,
  PACKAGE_NAMES,
} from "register-url-windows";
import { PROTOCOL } from "src/PROTOCOL";
import which from "which";
import { fetch } from "./fetch";
import fs from "fs";
import http from "http";
import tmp from "tmp";
import path from "path";
import tar from "tar";

const TARBALL_URL = `http://registry.npmjs.org/${PACKAGE_NAMES["win64-uac"]}/-/${PACKAGE_NAMES["win64-uac"]}-${BINARY_VERSION}.tgz`;

function downloadBin(): Promise<string> {
  const { name: tgzPath } = tmp.dirSync({
    postfix: "git-peek",
    unsafeCleanup: true,
  });
  return new Promise((resolve, reject) => {
    http.get(TARBALL_URL, function (response) {
      response.pipe(
        tar
          .x({
            cwd: tgzPath,
            strip: 1,
            onentry(entry) {},
            onwarn(message, data) {
              console.warn(message);
            },
          })
          .on("finish", () => {
            resolve(path.resolve(tgzPath, "register-url.exe"));
          })
          .on("error", (err) => {
            reject(err);
          })
      );
    });
  });
}

export async function register(editor: string) {
  console.log("Downloading register-url-windows!");
  const downloadPath = await downloadBin();
  console.log("Downloaded register-url-windows");

  console.log(
    `${chalk.whiteBright(
      "git-peek uses Administrator privileges to enable 1-click in Chrome & Edge"
    )}. Source code: \n${chalk.gray(
      "   https://github.com/Jarred-Sumner/register-url-windows/blob/main/dotnet/RegisterURLHandler/Program.cs"
    )}`
  );
  const result = await _register(
    {
      path: path.resolve(
        await which("git-peek"),
        "../",
        "node_modules",
        "@jarred",
        "git-peek",
        "bin",
        "git-peek-win32.exe"
      ),
      name: "git-peek",
      origins: [
        "github.com",
        "bitbucket.com",
        "gitlab.com",
        "*.gitlab.com",
        "sourcehut.org",
      ],
      register: true,
      protocol: PROTOCOL,
    },
    downloadPath
  );

  if (process.env.VERBOSE) console.log(result);

  if (result.error && !(result.protocol && result.edge && result.chrome)) {
    console.error(result.error);
  }

  if (result.exception && !(result.protocol && result.edge && result.chrome)) {
    console.error(result.exception);
  }

  if (result.protocol && result.edge && result.chrome) {
    console.log(`${chalk.green("Registered git-peek:// successfully")}`);
  } else if (result.protocol) {
    console.log(
      chalk.whiteBright("Registered git-peek://, but 1-click is disabled")
    );
    console.log(
      `${chalk.cyan(
        "To enable 1-click, re-run `git-peek -r` with Administrator privileges."
      )}`
    );
  } else {
    console.log(`${chalk.red("Register failed")}`);
  }

  process.exit();
}
