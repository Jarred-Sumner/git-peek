# git-peek

`git peek` is the fastest way to open a remote Git repository with your local text editor.

<!-- <video autoplay muted type="video/mp4" src="demo.mp4" autoplay loop muted playsinline width="960" height="600" /> -->
<img src="demo.gif" height="400" />

## Installation:

```
npm install -g @jarred/git-peek
```

## Usage:

```
git peek https://github.com/Jarred-Sumner/git-peek
```

Pass `git peek` a git repository or a github link, and it will quickly fetch it and open it in your local editor. It stores the repository in a temporary directory and deletes it when you close the editor.

It's fast.

```bash
❯ git peek https://github.com/nodejs/node/blob/master/lib/dgram.js
# Downloading https://github.com/nodejs/node/zipball/master to temp folder...
# --2021-02-10 04:56:46--  https://github.com/nodejs/node/zipball/master
# Resolving github.com (github.com)... 192.30.255.112
# Connecting to github.com (github.com)|192.30.255.112|:443... connected.
# HTTP request sent, awaiting response...
💻 Launched editor in 0.20s
```

```bash
❯ git peek -h
Quickly open a remote Git repository with your local text editor into a temporary folder.

USAGE
  $ git-peek [git link or github link]

OPTIONS
  -e, --editor=editor  [default: auto] editor to open with, possible values:
                       auto, code, vim, subl. By default, it will search
                       $EDITOR. If not found, it will try code, then subl,
                       then vim.

  -h, --help           show CLI help

  -v, --version        show CLI version
```

## How does this work?

If you pass it a GitHub repository, it fetches a tarball instead of using git. From unscientific benchmarks, this is about 2x faster than cloning. While downloading the tarball, it also downloads the specific file linked to (or the `README.md`) via JSDelivr's CDN. Whichever happens first, it opens in the editor, but it will keep fetching the repo until its complete or the program exits.

If you pass it a git repository rather than a Github url, it does a [partial clone](https://github.blog/2020-12-21-get-up-to-speed-with-partial-clone-and-shallow-clone/) instead of doing a full clone.

When your editor closes or you close `git peek`, it deletes the repository from your computer.

This was inspired by github1s.com.

Note: currently expects `wget` and `bsdtar` to be available in `$PATH`. If that's a problem, feel free to open an issue.
