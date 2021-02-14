import which from "which";
import plist from "simple-plist";
import child_process from "child_process";
import fs from "fs";
import path from "path";
import chalk from "chalk";

const TEMP_DIR = "/Applications/git-peek.app/Contents/temp";
import { PROTOCOL } from "./PROTOCOL";

export function execSync(cmd) {
  console.log("$ ", chalk.gray(cmd));
  return child_process.execSync(cmd, { cwd: process.cwd(), stdio: "inherit" });
}

export async function register(editor: string) {
  try {
    await which("duti");
  } catch (exception) {
    const installCommand = `HOMEBREW_NO_AUTO_UPDATE=1 HOMEBREW_NO_INSTALL_CLEANUP=1 brew install duti`;
    console.log(`duti not installed. Installing with homebrew.`);
    execSync(installCommand);
  }

  const gitPeekShim = path.join(
    "/Applications/git-peek.app/Contents/",
    "git-peek-shim"
  );

  console.log("Generating AppleScript handler.");
  const appleScriptCode = await generateAppleScript(gitPeekShim, TEMP_DIR);
  const appleScriptFile = path.join(process.cwd(), "git-peek.applescript");
  const appleScriptApp = path.join(process.cwd(), "git-peek.app");
  await fs.promises.writeFile(appleScriptFile, appleScriptCode, "utf8");
  console.log(chalk.gray(appleScriptCode));
  console.log("Compiling .applescript to .app");
  execSync(`osacompile -o git-peek.app ${appleScriptFile}`);
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
  plist.writeFileSync(infoPlist, info);
  console.log("Updated Info.plist");
  console.log("Moving application to /Applications/git-peek.app");
  if (fs.existsSync("/Applications/git-peek.app")) {
    fs.rmSync("/Applications/git-peek.app", {
      recursive: true,
      force: true,
    });
  }

  if (fs.existsSync("/Applications/git-peek.app")) {
    fs.rmSync("/Applications/git-peek.app", { force: true, recursive: true });
  }

  fs.renameSync(appleScriptApp, "/Applications/git-peek.app");

  console.log(chalk.gray(`mkdir ${TEMP_DIR}`));
  fs.mkdirSync(TEMP_DIR);

  const shim = `#!/bin/bash

# AppleScript might run as a different user/environment variables.
# So we have to inline some environment variables!
export PATH=$PATH:${JSON.stringify(process.env.PATH) || ""}
export EDITOR=${JSON.stringify(editor)}
export HOME=${JSON.stringify(process.env.HOME) || ""}
export USER=${JSON.stringify(process.env.USER) || ""}

.${JSON.stringify(await which("git-peek"))} --fromscript $1 $2 $3 $4
`;

  console.log(
    "// --- BEGIN SHIM FILE ---\n" +
      chalk.gray(shim) +
      "\n// --- END SHIM FILE ---"
  );
  console.log(`Wrote shim file (${chalk.gray(gitPeekShim)})`);
  fs.writeFileSync(gitPeekShim, shim, "utf8");
  execSync("chmod +x " + gitPeekShim);

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

  console.log(chalk.green("✅ Registered git-peek:// protocol successfully."));
  console.log('To unregister, just delete "/Applications/git-peek.app".');
  console.log("To test it, run this:");
  console.log("   " + chalk.blue(`open git-peek://Jarred-Sumner/git-peek`));
  if (editor.includes("vi")) {
    console.warn(
      "vim/vi not supported (no terminal window will be open), but if you know a way to run a terminal window from the AppleScript please do submit a PR!"
    );
  }
}

export async function generateAppleScript(shimLocation: string, tempDir) {
  return `
on open location this_URL
  try
    set innerCmd to "${shimLocation} " & quoted form of this_URL & " &> /dev/null &"
    do shell script innerCmd
  on error errMsg
    display dialog errMsg
  end try
end open location
`.trim();
}
