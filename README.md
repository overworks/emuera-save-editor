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

## CSV labels and encoding

Choose **Load CSV** to load the game's `ABL.csv`, `TALENT.csv`, `EXP.csv`, `PALAM.csv`, `ITEM.csv`, `FLAG.csv`, `CFLAG.csv`, or other supported standard label files. You can select multiple CSV files. Labels help you find values by name; they are optional and do not change save data or array sizes. When labels conflict, the first loaded name is kept and a warning is shown.

Text encoding detection tries UTF-8 first, then CP932/Shift-JIS. Some byte sequences are valid in both encodings. If text looks wrong, select the correct **Read encoding** and choose **Reopen with selected encoding**. Reopening discards edits after confirmation. The encoding selection also applies to subsequently loaded CSV files.

## Compatibility

The baseline is standard **Emuera 1.824**, preserved at commit [`85db4cbd`](https://github.com/0x00000FF/Emuera/tree/85db4cbd5eb2efe6c5b5449ada351a21a20db60b).

| Item | Support |
| --- | --- |
| Save types | Normal progress saves and global saves |
| Text saves | Legacy and extended sections; UTF-8 with or without BOM, and CP932/Shift-JIS |
| Binary saves | Format version 1808 |
| Values | Signed 64-bit integers, strings, and arrays up to three dimensions |
| Editing | Existing values; implicit zero/empty cells within declared binary array bounds |
| Size limits | 64 MiB per file; 100 million cells per binary array; 1 million stored values; 1 million text lines |

Text saves sometimes called “CSV saves” use Emuera's own format and are different from the CSV files used for labels. Text extension markers for 1700, 1708, 1729, 1803, and 1808 are recognized, with compatibility checks focused on the baseline engine's 1808 output.

Character or variable creation/deletion, array resizing, format conversion, ERB/ERH execution, `_Rename.csv` substitutions, and EM/EM+EE-specific extensions are not supported. Omitted trailing cells in text arrays cannot be edited because their declared size is unavailable. Multidimensional string arrays in text saves are not supported by the baseline engine. CSV labels do not infer game structure from character CSV files.

Out-of-range integers, characters unavailable in the original text encoding, reserved text delimiters, line breaks in text values, and malformed or unsupported files are rejected. Compatibility checks use synthetic saves generated and read by the original engine's save code; real user game saves have not yet been validated.

## Privacy and session data

Save and CSV contents stay in browser memory. The app has no upload API, analytics, remote fonts, or CDN dependencies, and does not store your work in cookies, localStorage, or IndexedDB.

After the app loads, editing, CSV loading, and downloading work without a network connection. Refreshing or closing the page discards your session, so download changes first. Offline reopening/PWA installation and opening the HTML directly through `file://` are not supported.

## Further reading and credits

- [Contributing](CONTRIBUTING.md): development setup, checks, and static hosting.
- [Agent context](AGENTS.md): code map and save-format invariants.
- [Reference engine checks](tests/reference/README.md): fixture provenance and compatibility testing.

This is an independent project, not an official Emuera application. Runtime libraries include React (MIT), encoding-japanese (MIT), and Lucide (ISC). The original Emuera copyright notice and license for the test sources are preserved in [upstream/LICENSE.txt](tests/reference/upstream/LICENSE.txt).
