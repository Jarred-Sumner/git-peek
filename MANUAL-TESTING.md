# Testing

Its a little bit tricky to test this works in all the edge cases. So I'm writing out what to test as I remember it.

Test that deleting works in Visual Studio with these repos:

### Extracting

```
git peek https://github.com/llvm/llvm-project # big repo
git peek https://github.com/node-fetch/node-fetch # little repo
```

Test on Windows, on Mac, with browser extension, and without browser extension.

Test that the shell runs with the correct environment variables on Mac when running from the extension.

Test that registering on Windows without administrator works.

Its not a big deal if deleting is unreliable on macOS because macOS will automatically delete temporary files every 3 days out of the box.

### Easy to forget

- For vim, test that we don't write text on top of the screen.
- Test that `$EDITOR` is propagating correctly.
- Test that it deletes the repo when you're on Sublime Text and close the window
- `shell`: false breaks VSCode exit detection
- `detached`: true, `shell`: true breaks on Windows if its not on a shell?

#### Known difficult-to-fix bugs

#### Sublime Text

- Closing Sublime Text via either the red X or Apple Q on mac does not release stdin, causing it to not inform git-peek that it has closed. This means that it won't auto delete repositories for Sublime Text if you close Sublime Text with Apple Q. Fortunately, macOS, auto-deletes everything in the temp folder every 3 days. Unfortunately however, this will cause the process to linger. Probably not the end of the world, it does just about nothing while its running in this state.

I have changed the behavior for Sublime Text to confirm deleting when from the shell.
