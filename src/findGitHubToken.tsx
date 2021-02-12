function _findGitHubToken() {
  if (process.env.GITHUB_TOKEN?.trim()?.length ?? 0) {
    return process.env.GITHUB_TOKEN.trim();
    // } else if (fs.existsSync(hubPath)) {
    //   const hub = yaml.load(fs.readFileSync(hubPath, "utf8"));
    //   if (typeof hub !== "object") return null;
    //   const githubKey = Object.keys(hub).find((k) =>
    //     k.toLowerCase().includes("github.com")
    //   );
    //   if (githubKey) {
    //     const tokenholder = hub[githubKey].find((k) => k?.oauth_token);
    //     if (tokenholder) {
    //       return tokenholder?.oauth_token;
    //     }
    //   }
    //   return null;
  } else {
    return null;
  }
}
let _githubToken;
export function findGitHubToken() {
  if (typeof _githubToken === "undefined") {
    _githubToken = _findGitHubToken();
  }

  return _githubToken;
}
