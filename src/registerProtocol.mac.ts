import which from "which";
import plist from "simple-plist";
import child_process from "child_process";
import fs from "fs";
import path from "path";
import chalk from "chalk";
import tmp from "tmp";

const APP_DIR = path.join(process.env.HOME, "Applications", "git-peek.app");

import { PROTOCOL } from "./PROTOCOL";
import terminal from "src/terminal";

export function execSync(cmd) {
  console.log("$ ", chalk.gray(cmd));
  return child_process.execSync(cmd, { cwd: process.cwd(), stdio: "inherit" });
}

export async function register(editor: string) {
  try {
    await which("duti");
  } catch (exception) {
    ``;
    const installCommand = `HOMEBREW_NO_AUTO_UPDATE=1 HOMEBREW_NO_INSTALL_CLEANUP=1 brew install duti`;
    console.log(`duti not installed. Installing with homebrew.`);
    execSync(installCommand);
  }

  const gitPeekShim = path.join(APP_DIR, "Contents", "git-peek-shim");

  console.log("Generating AppleScript handler.");
  const appleScriptCode = await generateAppleScript(gitPeekShim);
  const _tmp = tmp.dirSync({ unsafeCleanup: true });
  const appleScriptFile = path.join(_tmp.name, "git-peek.applescript");
  const appleScriptApp = path.join(_tmp.name, "git-peek.app");

  await fs.promises.writeFile(appleScriptFile, appleScriptCode, "utf8");
  console.log(chalk.gray(appleScriptCode));
  console.log("Compiling .applescript to .app");
  execSync(`osacompile -o ${appleScriptApp} ${appleScriptFile}`);
  console.log("Updating Info.plist to support URL handler");
  const infoPlist = path.join(appleScriptApp, "contents/Info.plist");
  const info = plist.readFileSync(infoPlist);
  info["CFBundleIdentifier"] = "com.apple.ScriptEditor.id.git-peek";
  info["CFBundleURLTypes"] = [
    {
      CFBundleURLName: "HTTP URL",
      CFBundleURLSchemes: ["http", "https", PROTOCOL],
    },
  ];
  info["LSBackgroundOnly"] = true;
  plist.writeFileSync(infoPlist, info);
  console.log("Updated Info.plist");
  console.log(`Moving application to ${APP_DIR}`);

  try {
    if (fs.existsSync(APP_DIR)) {
      fs.rmSync(APP_DIR, {
        recursive: true,
        force: true,
      });
    }
  } catch (exception) {
    if (process.env.VERBOSE) {
      console.warn("[WARN]", exception);
    }
  }

  fs.renameSync(appleScriptApp, APP_DIR);

  let alacrittyPath = "";
  try {
    alacrittyPath = `export ALACRITTY_PATH="${await which("alacritty")}"`;
  } catch (exception) {}

  const shim = `#!/bin/bash

# AppleScript might run as a different user/environment variables.
# So we have to inline some environment variables!
export PATH=$PATH:${JSON.stringify(process.env.PATH) || ""}
export EDITOR=${JSON.stringify(editor)}
export HOME=${JSON.stringify(process.env.HOME) || ""}
export USER=${JSON.stringify(process.env.USER) || ""}
export OPEN_IN_TERMINAL=${JSON.stringify(terminal)}
${alacrittyPath}

OPEN_IN_TERMINAL=${JSON.stringify(terminal)} .${JSON.stringify(
    await which("git-peek")
  )} --fromscript $1 $2 $3 $4 & disown
`;

  console.log(
    "// --- BEGIN SHIM FILE ---\n" +
      chalk.gray(shim) +
      "\n// --- END SHIM FILE ---"
  );
  console.log(`Wrote shim file (${chalk.gray(gitPeekShim)})`);
  fs.writeFileSync(gitPeekShim, shim, "utf8");
  execSync("chmod +x " + gitPeekShim);

  if (fs.existsSync("/Applications/git-peek.app")) {
    try {
      fs.rmSync("/Applications/git-peek.app", { force: true });
    } catch (exception) {}
  }

  console.log("Registering URL handler...");
  execSync(`duti -s com.apple.ScriptEditor.id.git-peek ${PROTOCOL}`);

  fs.rmSync(appleScriptFile);

  if (fs.existsSync("/Applications/Google Chrome.app")) {
    console.log(`Adding ${PROTOCOL}:// to Google Chrome`);
    try {
      execSync(
        `defaults write com.google.Chrome URLWhitelist -array '${PROTOCOL}://*'`
      );
    } catch (exception) {
      console.warn("Failed to add protocol to Google Chrome. Its okay.");
    }
  }
  console.log(`To unregister, just delete "${APP_DIR}".`);

  console.log(chalk.green("✅ Registered git-peek:// protocol successfully."));

  if (editor.includes("vi")) {
    console.log(
      `Defaulting to ${chalk.blue(editor)} in ${chalk.blue(
        terminal
      )}\n${chalk.gray("To change the editor, set")} EDITOR= ${chalk.gray(
        "in"
      )} ${process.env.HOME}/.git-peek.\n${chalk.gray(
        "To change the terminal, set"
      )} OPEN_IN_TERMINAL= iterm apple alacritty.`
    );
  }
  console.log("To test it, run this:");
  console.log("   " + chalk.blue(`open git-peek://Jarred-Sumner/git-peek`));
}

export async function generateAppleScript(shimLocation: string) {
  return `

on open location this_URL
  try
    set innerCmd to "${shimLocation} " & quoted form of this_URL & " &> /usr/local/var/log/git-peek &"
    do shell script innerCmd
  on error errMsg
    display dialog errMsg
  end try
end open location
`.trim();
}
