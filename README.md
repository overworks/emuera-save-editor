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

1. Open one `save*.sav` or `global.sav` file with the file picker, or drop it in the save drop area. Once a save is open, drop another onto the filename bar to replace it.
2. Select shared/global variables or a character. Search by variable name, CSV label, or exact array index. Use `1:2:3` for a multidimensional index.
3. Click a value, enter its replacement, and apply the change. The **Changes** tab shows the original and current values. You can undo individual changes or reset them all.
4. Choose **Download save** to save `original-name.edited.sav`.
5. Keep a backup of the original, rename the edited copy to the original filename, and place it in the game's save folder.

The app downloads a separate file and does not overwrite your original. Downloads retain the original format and encoding. With no changes, the download is byte-for-byte identical to the input. Edited files are checked before downloading, but the app cannot validate a game's rules or the meaning of each value.

## Resizing a binary array

Open a binary save, select an array in **Variable group**, and choose **Resize array**. Enter each dimension's length, then apply the change. Integer and string arrays with one to three dimensions can grow or shrink, including to zero cells, without changing their rank. The total must stay within 100 million cells.

Existing values keep their coordinates. New cells contain `0` or empty text. Cells outside the new bounds are excluded from the download; growing the array again in the same session restores their values and edits. **Changes** shows size changes alongside value edits, with individual undo and **Revert all**. Restoring the original size excludes edits to added cells; a download with no active changes is byte-identical to the input.

This changes the size stored in the save. The game still uses its own declared array sizes and may ignore extra cells. Text saves do not declare complete array sizes, so text arrays cannot be resized.

## Adding and deleting binary variables

Open a binary save and choose **Add variable**. Enter the name, scope, integer/string type, and scalar or array dimensions. Shared/global variables support scalars and one to three dimensions. For a character, choose built-in variables (scalars or one to two dimensions) or script-defined `#DIM`/`#DIMS` variables (one to two dimensions). New values start at `0` or empty text; zero-length arrays are allowed, with the same 100-million-cell limit.

Names must start with a letter or underscore and contain only letters, combining marks, numbers, or underscores, up to 128 UTF-16 units. An active name cannot be duplicated within the same scope, ignoring case. This is an editor input restriction, not validation of a game's declarations.

To remove a variable, select it in **Variable group** and choose **Delete variable**. **Changes** lists additions and deletions with individual undo. Deleting an original variable hides its values and size edits until restored; deleting a newly added variable cancels it and its edits. If a new variable occupies a deleted name, cancel the addition before restoring the original. **Revert all** restores the original bytes, including after deleting every variable in a scope.

These operations change records in the save. They do not add or remove declarations in the game: names, types, scope, and dimensions must match what the game expects, and missing or unknown records may be ignored or use game defaults. Text variable addition/deletion remains unsupported. See [binary variable semantics and source evidence](docs/binary-variables.md).

## Duplicating and deleting characters

In a normal text or binary save, select a character and choose **Duplicate character**. An independent copy is appended with the character's current values, array sizes, and variables, including your edits. Its `NAME` and `NO` are copied too; edit them afterward if needed. `NO` is separate from the displayed save position (`#0`, `#1`, …) and does not have to be unique. Empty characters can be copied, but this feature cannot create a character without an existing character to copy. It does not initialize characters from game scripts or CSV files.

**Delete character** shows a confirmation with affected standard references. Later characters move up one position. Integer cells `TARGET:0`, `ASSI:0`, `MASTER:0`, and `PLAYER:0` keep referring to the same character; a reference to the deleted character becomes `-1`. Negative and already out-of-range values are preserved. Game-specific references, other array cells, `NO`, and `RELATION` indices are not adjusted. Review any references your game stores elsewhere.

**Changes** includes character operations and automatic reference adjustments. Undoing an original character's deletion restores its values, variable edits, and original position, and restores references unless you edited them. Manually edited standard references follow the character at the position entered at that time. To override an automatic adjustment, edit the reference value; to undo the adjustment, undo the character operation. Deleting a copy cancels that copy and its edits. **Revert all** restores the original bytes, even after deleting every character. Global saves do not offer these operations.

Text operations copy or remove both the fixed-order base block and the character’s extension block. They preserve the original encoding, BOM, markers, and line endings. At a new boundary where a bare CR would merge with an LF, one LF is inserted to retain both lines. Only stored reference cells are adjusted; omitted cells remain omitted. Copied text arrays retain their ragged rows and editable cells.

See [binary character semantics](docs/binary-characters.md) and [text character semantics](docs/text-characters.md) for source evidence, reference rules, and verification limits.

## Game presets

Choose **Game preset** in the editor for localized names, explanations, and shortcuts to frequently used fields. The catalog covers **eraTWKR Textbung (based on TWKR 1.20)**, **eratohoK 1.29.3**, **eraMegaten KR Rev.143**, and **ShinEraTenseiP 0.5.9**. Each shows the source edition and a link to its variable definitions. Game code and version suggest a candidate; when related games share a code and the version cannot distinguish them, choose manually. Code/version differences are shown, and matching identifiers do not establish compatibility with every patch or engine fork.

Expand **Frequently used fields** and select a character to enable their shortcuts; shared funds can be opened directly where included. Shortcuts open an existing field, and preset names and explanations are searchable in the current interface language within the selected scope and variable group. Missing or incompatible fields are unavailable. CSV labels remain primary, with preset guidance displayed separately.

Selecting or switching presets leaves save values and edits intact. The selection survives a language change or failed file open and clears when another save opens successfully. It is also restored when local session recovery is enabled. Presets work offline after the app loads. They provide a small set of field guides, not complete game data or automatic value changes. See [preset mappings, source editions, and verification limits](docs/game-presets.md).

## CSV labels and encoding

After opening a save, drop the game's `ABL.csv`, `TALENT.csv`, `EXP.csv`, `PALAM.csv`, `ITEM.csv`, `FLAG.csv`, `CFLAG.csv`, or other supported standard label files into **Game CSV labels**. You can drop multiple CSV files at once or select them with **Load CSV**. The dashed save and CSV areas handle their respective file types; dropping elsewhere does not open a file. Labels help you find values by name; they are optional and do not change save data or array sizes. When labels conflict, the first loaded name is kept and a warning is shown.

`Chara*.csv` adds reference names, call names, nicknames, and names for the master. Its `NO` or `番号` must match the character's current saved `NO`; the filename and character position are not used for matching. Select a character and expand **Character CSV** to inspect the metadata. Names also appear beside saved name fields and `NO`, and label `RELATION` indices by character number. You can search these labels, including call names and nicknames for `RELATION`. Editing `NO` updates the association. Saved names remain unchanged; initial stats and character creation are not imported. Duplicate character numbers keep the first file's metadata.

`_Rename.csv` adds search substitutions using the engine's `replacement,token` syntax. For example, `ABL:0,focus` lets you search for `[[focus]]`, and `0,skill` lets you search for `ABL:[[skill]]`. The expanded search is shown below the search box. Use a variable name, label, numeric index, or a reference such as `TA:3:2:1` within the selected scope. Tokens are case-sensitive; each rule runs once in import order, with the first definition retained on conflicts. Substitution applies only to search input. It does not alter CSV names or save values, and expressions or dynamic character selectors such as `TARGET` are not evaluated.

CSV imports are limited to a total of 64 MiB per session. Metadata is cleared when another save opens successfully and is restored with the session if local recovery is enabled. See [CSV syntax and source evidence](docs/csv-metadata.md) for supported fields, escaped commas, and limits.

Text encoding detection tries UTF-8 first, then CP932/Shift-JIS. Some byte sequences are valid in both encodings. If text looks wrong, select the correct **Read encoding** and choose **Reopen with selected encoding**. Reopening discards edits after confirmation. The encoding selection also applies to subsequently loaded CSV files.

## Compatibility

The baseline is standard **Emuera 1.824**, preserved at commit [`85db4cbd`](https://github.com/0x00000FF/Emuera/tree/85db4cbd5eb2efe6c5b5449ada351a21a20db60b).

| Item | Support |
| --- | --- |
| Save types | Normal progress saves and global saves |
| Text saves | Legacy and extended sections; UTF-8 with or without BOM, and CP932/Shift-JIS |
| Binary saves | Format version 1808 |
| Values | Signed 64-bit integers, strings, and arrays up to three dimensions |
| Editing | Existing values; implicit zero/empty binary cells; binary array resizing with unchanged rank; binary variable addition/deletion; normal text/binary character duplication/deletion |
| Size limits | 64 MiB per file; 100 million cells per binary array; 1 million stored values; 1 million text lines |

Text saves sometimes called “CSV saves” use Emuera's own format and are different from the CSV files used for labels. Text extension markers for 1700, 1708, 1729, 1803, and 1808 are recognized. General value checks use the baseline engine’s 1808 output; character operations also cover the legacy layout and every recognized extension marker with synthetic reference fixtures.

Creating characters without copying an existing character, individual text variable addition/deletion, text array resizing, format conversion, ERB/ERH execution, and EM/EM+EE-specific extensions are not supported. Omitted trailing cells in text arrays cannot be edited because their declared size is unavailable. Multidimensional string arrays in text saves are not supported by the baseline engine. Character CSV metadata and search substitutions do not infer or execute game structure or scripts.

Out-of-range integers, characters unavailable in the original text encoding, reserved text delimiters, line breaks in text values, and malformed or unsupported files are rejected. Automated compatibility checks use synthetic saves generated and read by the original engine's save code. A user has also confirmed loading, editing, and exporting actual save data. This report does not establish in-game reloading or compatibility with every game or fork, or validate array resizing, variable addition/deletion, and character duplication/deletion with real saves.

## Planned support

Unsupported features are being addressed incrementally. Binary array resizing, binary variable addition/deletion, normal text/binary character duplication/deletion, character CSV name metadata, `_Rename.csv` search substitutions, and optional local session recovery are implemented. Remaining work includes:

- Character creation without copying, and individual text variable addition/deletion.
- Text array resizing and format conversion, with explicit size information where required.
- EM/EM+EE-specific formats, with separate format evidence and fixtures.
- Offline reopening/PWA and a `file://` entry point.
- ERB/ERH execution, which requires a separate execution design.

These items remain unsupported until implemented and verified. This list does not imply a delivery date.

## Local session recovery

**Save work in this browser** is off by default. Turn it on to automatically save one workspace in this browser and restore it when you refresh or return to the same site. This includes the original file, applied value and structure edits, undo state, imported CSV data, read encoding, game preset, search, selected scope/variable, and page. Unapplied input in an open dialog is not saved. Opening another save successfully replaces the stored workspace; a failed open keeps it.

Wait for **Saved in this browser** before leaving. Turning recovery off asks for confirmation and deletes the stored workspace while leaving your open work in memory. Storage errors leave live edits available and retain the last committed recovery; use **Retry saving** or download your work. If another tab changes or deletes recovery, stale tabs stop saving rather than overwrite it.

Recovery uses IndexedDB in the current browser profile and site path; it does not sync between browsers or devices. The recovery journal is limited to 100,000 operations and 128 MiB including the original file and imported CSVs. If this limit is reached, download the edited save and reopen it to start a new workspace. Browser data deletion, storage eviction, or closing a private browsing session can remove recovery, so keep downloaded backups. Recovery does not provide offline reopening or PWA installation.

## Privacy and session data

Save and CSV contents stay in browser memory unless you enable local session recovery, which also stores them in this browser's IndexedDB. The app has no upload API, analytics, remote fonts, or CDN dependencies. It does not use cookies or localStorage, and language preference remains in the URL.

After the app loads, editing, CSV loading, downloading, and enabled local saving work without a network connection. Without local recovery, refreshing or closing the page discards your session. Offline reopening/PWA installation and opening the HTML directly through `file://` are not supported.

## Further reading and credits

- [Contributing](CONTRIBUTING.md): development setup, checks, and static hosting.
- [Agent context](AGENTS.md): code map and save-format invariants.
- [Reference engine checks](tests/reference/README.md): fixture provenance and compatibility testing.

Original project code is licensed under the [MIT License](LICENSE). Third-party code retains its original license terms.

This is an independent project, not an official Emuera application. Runtime libraries include React (MIT), encoding-japanese (MIT), and Lucide (ISC). The original Emuera copyright notice and license for the test sources are preserved in [upstream/LICENSE.txt](tests/reference/upstream/LICENSE.txt).
