# Emuera Save Studio

**English** · [한국어](README.ko.md) · [日本語](README.ja.md)

Read and edit Emuera saves in your browser. The app supports text and binary saves, including `global.sav`, without uploading your files or requiring a backend, account, or database. The interface supports English, Korean, and Japanese.

## Getting started

[Open Emuera Save Studio](https://overworks.github.io/emuera-save-editor/) in your browser. No installation is required. Choose **Explore sample** to try a synthetic save before opening your own file.

To run the app locally, install Node.js 22.x (22.12 or newer), 24.x, or 26.x and npm, then run these commands from the project directory:

```sh
npm ci
npm run dev
```

Open the URL printed in the terminal.

Use a recent desktop browser. Browser tests currently cover Chromium at desktop and mobile screen sizes.

## Language

Use the language selector in the header to switch between **English**, **한국어**, and **日本語**. The app follows your browser's preferred supported language and falls back to English. A language in the URL (`?lang=en`, `?lang=ko`, or `?lang=ja`) takes priority. Selecting a language updates that URL, so the choice survives a refresh and can be bookmarked without cookies or localStorage.

Switching languages preserves your open save, edits, search, and CSV labels. Buttons, help, errors, and notifications are translated; filenames, variable names, character names, CSV labels, and save values stay as written. All translations are bundled, so switching works offline after the app loads.

## Editing a save

1. Open or drop one `save*.sav` or `global.sav` file into the app.
2. Select shared/global variables or a character. Search by variable name, CSV label, or exact array index. Use `1:2:3` for a multidimensional index.
3. Click a value, enter its replacement, and apply the change. The **Changes** tab shows the original and current values. You can undo individual changes or reset them all.
4. Choose **Download save** to save `original-name.edited.sav`.
5. Keep a backup of the original, rename the edited copy to the original filename, and place it in the game's save folder.

The app downloads a separate file and does not overwrite your original. Downloads retain the original format and encoding. With no changes, the download is byte-for-byte identical to the input. Edited files are checked before downloading, but the app cannot validate a game's rules or the meaning of each value.

## Resizing a binary array

Open a binary save, select an array in **Variable group**, and choose **Resize array**. Enter each dimension's length, then apply the change. Integer and string arrays with one to three dimensions can grow or shrink, including to zero cells, without changing their rank. The total must stay within 100 million cells.

Existing values keep their coordinates. New cells contain `0` or empty text. Cells outside the new bounds are excluded from the download; growing the array again in the same session restores their values and edits. **Changes** shows size changes alongside value edits, with individual undo and **Revert all**. Restoring the original size excludes edits to added cells; a download with no active changes is byte-identical to the input.

This changes the size stored in the save. The game still uses its own declared array sizes and may ignore extra cells. Text saves do not declare complete array sizes, so text arrays cannot be resized.

## CSV labels and encoding

Choose **Load CSV** to load the game's `ABL.csv`, `TALENT.csv`, `EXP.csv`, `PALAM.csv`, `ITEM.csv`, `FLAG.csv`, `CFLAG.csv`, or other supported standard label files. You can select multiple CSV files. Labels help you find values by name; they are optional and do not change save data or array sizes. When labels conflict, the first loaded name is kept and a warning is shown.

`Chara*.csv` adds reference names, call names, nicknames, and names for the master. Its `NO` or `番号` must match the character's current saved `NO`; the filename and character position are not used for matching. Select a character and expand **Character CSV** to inspect the metadata. Names also appear beside saved name fields and `NO`, and label `RELATION` indices by character number. You can search these labels, including call names and nicknames for `RELATION`. Editing `NO` updates the association. Saved names remain unchanged; initial stats and character creation are not imported. Duplicate character numbers keep the first file's metadata.

`_Rename.csv` adds search substitutions using the engine's `replacement,token` syntax. For example, `ABL:0,focus` lets you search for `[[focus]]`, and `0,skill` lets you search for `ABL:[[skill]]`. The expanded search is shown below the search box. Use a variable name, label, numeric index, or a reference such as `TA:3:2:1` within the selected scope. Tokens are case-sensitive; each rule runs once in import order, with the first definition retained on conflicts. Substitution applies only to search input. It does not alter CSV names or save values, and expressions or dynamic character selectors such as `TARGET` are not evaluated.

CSV imports are limited to a total of 64 MiB per session. Metadata stays in memory and is cleared when another save opens successfully. See [CSV syntax and source evidence](docs/csv-metadata.md) for supported fields, escaped commas, and limits.

Text encoding detection tries UTF-8 first, then CP932/Shift-JIS. Some byte sequences are valid in both encodings. If text looks wrong, select the correct **Read encoding** and choose **Reopen with selected encoding**. Reopening discards edits after confirmation. The encoding selection also applies to subsequently loaded CSV files.

## Compatibility

The baseline is standard **Emuera 1.824**, preserved at commit [`85db4cbd`](https://github.com/0x00000FF/Emuera/tree/85db4cbd5eb2efe6c5b5449ada351a21a20db60b).

| Item | Support |
| --- | --- |
| Save types | Normal progress saves and global saves |
| Text saves | Legacy and extended sections; UTF-8 with or without BOM, and CP932/Shift-JIS |
| Binary saves | Format version 1808 |
| Values | Signed 64-bit integers, strings, and arrays up to three dimensions |
| Editing | Existing values; implicit zero/empty binary cells; binary array resizing with unchanged rank |
| Size limits | 64 MiB per file; 100 million cells per binary array; 1 million stored values; 1 million text lines |

Text saves sometimes called “CSV saves” use Emuera's own format and are different from the CSV files used for labels. Text extension markers for 1700, 1708, 1729, 1803, and 1808 are recognized, with compatibility checks focused on the baseline engine's 1808 output.

Character or variable creation/deletion, text array resizing, format conversion, ERB/ERH execution, and EM/EM+EE-specific extensions are not supported. Omitted trailing cells in text arrays cannot be edited because their declared size is unavailable. Multidimensional string arrays in text saves are not supported by the baseline engine. Character CSV metadata and search substitutions do not infer or execute game structure or scripts.

Out-of-range integers, characters unavailable in the original text encoding, reserved text delimiters, line breaks in text values, and malformed or unsupported files are rejected. Automated compatibility checks use synthetic saves generated and read by the original engine's save code. A user has also confirmed loading, editing, and exporting actual save data. This report does not establish in-game reloading or compatibility with every game or fork, or validate the newly added resizing feature with real saves.

## Planned support

Unsupported features are being addressed incrementally. Binary array resizing, character CSV name metadata, and `_Rename.csv` search substitutions are implemented. Remaining work includes:

- Character and variable creation/deletion.
- Text array resizing and format conversion, with explicit size information where required.
- EM/EM+EE-specific formats, with separate format evidence and fixtures.
- Optional local session recovery, offline reopening/PWA, and a `file://` entry point.
- ERB/ERH execution, which requires a separate execution design.

These items remain unsupported until implemented and verified. This list does not imply a delivery date.

## Privacy and session data

Save and CSV contents stay in browser memory. The app has no upload API, analytics, remote fonts, or CDN dependencies, and does not store your work in cookies, localStorage, or IndexedDB.

After the app loads, editing, CSV loading, and downloading work without a network connection. Refreshing or closing the page discards your session, so download changes first. Offline reopening/PWA installation and opening the HTML directly through `file://` are not supported.

## Further reading and credits

- [Contributing](CONTRIBUTING.md): development setup, checks, and static hosting.
- [Agent context](AGENTS.md): code map and save-format invariants.
- [Reference engine checks](tests/reference/README.md): fixture provenance and compatibility testing.

Original project code is licensed under the [MIT License](LICENSE). Third-party code retains its original license terms.

This is an independent project, not an official Emuera application. Runtime libraries include React (MIT), encoding-japanese (MIT), and Lucide (ISC). The original Emuera copyright notice and license for the test sources are preserved in [upstream/LICENSE.txt](tests/reference/upstream/LICENSE.txt).
