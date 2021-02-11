# git-peek

`git peek` is the fastest way to open a remote Git repository with your local text editor.

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
git peek hanford/trends
git peek react
git peek https://github.com/jarred-sumner/fastbench.dev/tree/master/src
git peek https://github.com/evanw/esbuild/blob/master/lib/common.ts
```

Pass `git peek` a git repository or a github link, and it will quickly fetch and open it in your local editor. It stores the repository in a temporary directory and deletes it when you close the editor or `git peek`.

It's fast.

```bash
❯ git peek https://github.com/nodejs/node/blob/master/lib/dgram.js
⏳ Extracting repository to temp folder...
💻 Launched editor in 0.20s
```

If you don't pass `git peek` any input, it will let you search Github repositories and show [trending repositories](https://trends.now.sh):

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

```bash
❯ git peek -h
USAGE
  $ git-peek [git link or github link or search query or repository file path]

OPTIONS
  -e, --editor=editor  [default: auto] editor to open with, possible values:
                        auto, code, vim, subl. By default, it will search
                        $EDITOR. If not found, it will try code, then subl,
                        then vim.

  -h, --help           show CLI help
```

## How does this work?

If you pass it a GitHub repository, it fetches a tarball instead of using git. From unscientific benchmarks, this is about 2x faster than cloning. While downloading the tarball, it also downloads the specific file linked to (or the `README.md`) via JSDelivr's CDN. Whichever happens first, it opens in the editor, but it will keep fetching the repo until its complete or the program exits.

If you pass it a git repository rather than a Github url, it does a [partial clone](https://github.blog/2020-12-21-get-up-to-speed-with-partial-clone-and-shallow-clone/) instead of doing a full clone.

When your editor closes or you close `git peek`, it deletes the repository from your computer.

This was inspired by github1s.com.

Note: currently expects `wget` and `bsdtar` to be available in `$PATH`. If that's a problem, feel free to open an issue.
