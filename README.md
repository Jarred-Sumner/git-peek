# git-peek

`git peek` is the fastest way to open a remote git repository in your local text editor.

<!-- <video autoplay muted type="video/mp4" src="demo.mp4" autoplay loop muted playsinline width="960" height="600" /> -->
<img src="demo.gif" height="400" />

Use it when you want to browse or search other people's code with your own editor.

## Installation:

```
npm install -g @jarred/git-peek
```

## Usage:

```
git peek https://github.com/ylukem/pin-go
git peek https://github.com/jarred-sumner/atbuild
git peek https://github.com/facebook/react/pull/20790
git peek hanford/trends
git peek react
git peek https://github.com/jarred-sumner/fastbench.dev/tree/main/
git peek https://github.com/evanw/esbuild/blob/master/lib/common.ts
```

Pass `git peek` a git repository or a github link, and it will quickly fetch and open it in your local editor. It stores the repository in a temporary directory and deletes it when you close the editor or `git peek`.

It's fast.

```bash
❯ git peek https://github.com/nodejs/node/blob/master/lib/dgram.js
⏳ Extracting repository to temp folder...
💻 Launched editor in 0.20s
```

If you paste a link to a pull request on GitHub, it will open it quickly:

```
❯ git peek https://github.com/facebook/react/pull/20790
💻 Launched editor in 0.13s
⏳ Extracting repository to temp folder...
💿 Finished downloading repository!
```

Much faster than cloning.

If you don't pass `git peek` input, it will let you search Github repositories and show [trending repositories](https://trends.now.sh):

```
❯ git peek
Search Github repositories:
> Search
❯ iam-abbas/Reddit-Stock-T | Fetch currently trending stocks on Reddit
  codeSTACKr/free-develope | Free Developer Resources
  justjavac/1s             | 天若有情天亦老，我为网站加一秒
  PaddlePaddle/PaddleNLP   | NLP Core Library and Model Zoo based on PaddlePa
  ModernPwner/cicuta_viros |
  jevakallio/vscode-live-f | Run your web app inside VS Code
  getActivity/AndroidCodeS | Android 代码规范文档
  gigantz/react-xpress     | React renderer to build Node.js server
```

If you type a repository name without the owner (`react` instead of `facebook/react`), it will search:

```
❯ git peek react
Search Github repositories:
> react
❯ facebook/react           | A declarative, efficient, and flexible JavaScrip
  typescript-cheatsheets/r | Cheatsheets for experienced React developers get
  duxianwei520/react       |  React+webpack+redux+ant design+axios+less全家桶后台管
  discountry/react         | React docs in Chinese | React 中文文档翻译
  Cathy0807/react          | 京东首页构建
  react-redux-antd-es6/rea | 基于react的企业后台管理开发框架
  HackYourFuture/React     | This repository contains all the material for th
  geist-org/react          | Modern and minimalist React UI library.
```

If you paste a link to a file on GitHub, it will quickly open the file in your local editor:

```
❯ git peek https://github.com/Jarred-Sumner/git-peek/blob/main/src/index.ts
💻 Launched editor in 0.39s
⏳ Extracting repository to temp folder...
💿 Finished downloading repository!
```

```bash
❯ git peek -h
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
                               auto, code, subl, vim, vi, code-insiders. By default, it will search
                               $EDITOR. If not found, it will try code, then subl,
                               then vim.

          -o, --out=           [default: system temp directory] output directory to
                               store repository files in. If you're cloning a large
                               repo and your tempdir is an in-memory storage (/tmp),
                               maybe change this.

          -w, --wait           [default: false] wait to open the editor until the
                               repository finishes downloading.

          -h, --help           show CLI help
```

## How does this work?

If you pass it a GitHub repository, it fetches a tarball instead of using git and decompresses it while downloading it (streaming). From unscientific benchmarks, this is about 2x faster than cloning. While downloading & decompressing the tarball, it also downloads the specific file linked to (or the `README.md`) via JSDelivr's CDN. Whichever happens first, it opens in the editor (usually JSDelivr), but it will keep fetching the repo until its complete or the program exits.

If you pass it a git repository rather than a Github url, it does a [partial clone](https://github.blog/2020-12-21-get-up-to-speed-with-partial-clone-and-shallow-clone/) instead of doing a full clone.

When your editor closes or you close `git peek`, it deletes the repository from your computer.

This was inspired by github1s.com.

### Changelog

- `1.1.27`: Added `--wait` flag which waits to open the editor until the entire repository is downloaded. Added `--out` flag which changes the temp directory to store files in (see #8)
- `1.1.22-26`: Fix windows bug.
- `1.1.21`: Add Pull Request support. Now you can use this to quickly read a pull request. For example: `git peek https://github.com/facebook/react/pull/20790`.
- `1.1.20`: Fix bug when using with Fedora
- `1.1.16-1.1.19`: trying to get `release-it` to work
- `1.1.15`: Move `code-insiders` to end of preference list
- `1.1.14`: Fix code-insiders and fix passing in editor manually when its `subl` or `code`.
- `1.1.13`: Use `Authorization` header instead of `access_token` query string.
- `1.1.12`: When available, also use github access token for fetching tarballs (instead of just search)
- `1.1.11`: When available, use github access token for github API requests to enable private repositories to work. To enable this, either set a `GITHUB_TOKEN` environment variable or if you've installed [hub](https://github.com/github/hub), it will automatically use `oauth_token` from `$HOME/.config/hub`. In other words, if you use `hub`, this should just work by default.
- `1.1.10`: Fix vim
- `1.1.9`: Fix Windows
