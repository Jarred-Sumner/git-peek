# git-peek

Quickly open a remote Git repository with your local text editor into a temporary folder.

## Usage:

```
git peek https://github.com/Jarred-Sumner/git-peek
```

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

## Installation:

```
npm install -g git-peek
```

## How does this work?

If you pass it a GitHub repository, it fetches a tarball instead of using git. From unscientific benchmarks, this is about 2x faster than cloning. While downloading the tarball, it also downloads the specific file linked to (or the `README.md`) via JSDelivr's CDN. Whichever happens first, it opens in the editor, but it will keep fetching the repo until its complete or the program exits.

If you pass it a git repository rather than a Github url, it does a [partial clone](https://github.blog/2020-12-21-get-up-to-speed-with-partial-clone-and-shallow-clone/) instead of doing a full clone.

When your editor closes or you close `git view`, it deletes the repository from your computer.

This was inspired by github1s.com.

Note: currently expects `wget` and `bsdtar` to be available in `$PATH`. If that's a problem, feel free to open an issue.
