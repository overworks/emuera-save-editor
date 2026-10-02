# Reference engine checks

**English** · [한국어](README.ko.md) · [日本語](README.ja.md)

These checks compare the browser editor with the original Emuera save reader and writer. See [CONTRIBUTING.md](../../CONTRIBUTING.md) for the full development workflow.

## Provenance

The three C# files and `LICENSE.txt` in `upstream/` were copied without modification from:

- Repository: [0x00000FF/Emuera](https://github.com/0x00000FF/Emuera).
- Commit: [`85db4cbd5eb2efe6c5b5449ada351a21a20db60b`](https://github.com/0x00000FF/Emuera/tree/85db4cbd5eb2efe6c5b5449ada351a21a20db60b), preserving the original Emuera 1.824 source.
- Original paths: `Emuera/Sub/EraBinaryDataReader.cs`, `Emuera/Sub/EraBinaryDataWriter.cs`, and `Emuera/Sub/EraDataStream.cs`.
- Copyright (C) 2008- MinorShift, 妊）|дﾟ)の中の人. The original notice and terms remain in [upstream/LICENSE.txt](upstream/LICENSE.txt).

[Program.cs](Program.cs) and [Oracle.csproj](Oracle.csproj) are test adapters added by this project, not original engine files. They provide minimal `Config` and `FileEE` hosts so the save-format code can run without the game UI or scripts. Keep adaptations separate from the unchanged upstream sources and license.

## What is checked

The original writer generates six fixtures: normal/global saves in binary, UTF-8 text, and CP932 text. Characters and values are synthetic and were not taken from a game's save files. Fixture generation also copies the normal binary save to [src/assets/demo.sav](../../src/assets/demo.sav).

The TypeScript editor modifies these saves, then the original reader reads the results. [scripts/reference-check.ts](../../scripts/reference-check.ts) compares the complete value dictionaries before and after editing to ensure only the intended values changed. The text reader needs array sizes supplied by the host; the adapter uses 128-element arrays for legacy sections, which is sufficient for these fixtures and is not a claim about other games' sizes.

For binary saves, the adapter also reports each array's saved dimensions, including empty arrays. The check grows, shrinks, mixes growth and shrinkage across axes, and empties arrays of each available type and rank in both normal and global fixtures. Expected values come from the original reader's pre-edit dictionary at unchanged coordinates, plus explicitly assigned new values. Resetting all edits and sizes must reproduce the original bytes.

The format evidence for resizing is the per-axis `ReadInt32()` lengths in the upstream `EraBinaryDataReader1808.ReadIntArray*` and `ReadStrArray*` methods. The reader uses separate destination array sizes supplied by the game and may copy only the overlapping region. Changing a save's dimensions therefore does not change the game's variable declarations. The adapter allocates destination arrays using the saved dimensions to check every exported cell.

This checks save-code compatibility without running a game. It does not validate game script rules, actual user saves, or every Emuera fork. The C# code is used only for development checks and is not included in the browser bundle.

## Running the checks

Install the project's npm dependencies and the .NET 8 SDK. From the repository root, run:

```sh
npm run test:reference
```

Set `DOTNET=/absolute/path/to/dotnet` if the executable is not on `PATH`. [scripts/oracle.ts](../../scripts/oracle.ts) builds the adapter into `.reference/bin`; edited files are written under `.reference/edited`. Both are ignored build/test output.

To intentionally regenerate the six committed save fixtures and the bundled demo, run:

```sh
npm run fixtures
```

Review fixture changes and rerun compatibility checks after regeneration. The committed fixtures allow ordinary core tests to run without .NET.
