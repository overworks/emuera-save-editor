# Agent context

This is the repository-wide entry point for coding agents, maintained in English. Read [CONTRIBUTING.md](CONTRIBUTING.md) for setup, validation commands, contribution guidelines, and documentation policy. The [README](README.md) is the user guide.

## Product scope

Emuera Save Studio is a static browser application with English, Korean, and Japanese interfaces. It edits values in normal and global saves from standard Emuera, using text or binary formats, and resizes binary arrays without changing their rank. Files stay in browser memory. The baseline is Emuera 1.824 at commit `85db4cbd5eb2efe6c5b5449ada351a21a20db60b`; see [reference provenance](tests/reference/README.md).

Current scope excludes character/variable creation or deletion, text array resizing, format conversion, ERB/ERH execution, `_Rename.csv`, and fork-specific EM/EM+EE formats. There is no backend, account system, persistent session storage, PWA, or `file://` entry point. Planned support is tracked in the README.

## Code map

| Location | Responsibility |
| --- | --- |
| [src/core/model.ts](src/core/model.ts) | Save model, signed 64-bit bounds, coordinates, limits, and byte patches |
| [src/core/binary.ts](src/core/binary.ts) | Binary 1808 reader and variable writer, including compressed arrays |
| [src/core/text.ts](src/core/text.ts) | Legacy/extended text parsing, fixed variable order, and byte spans |
| [src/core/encoding.ts](src/core/encoding.ts) | UTF-8/CP932 detection and lossless text encoding |
| [src/core/editor.ts](src/core/editor.ts) | Edit overlays, search, pagination, summaries, and validated serialization |
| [src/core/labels.ts](src/core/labels.ts) | Standard CSV label families, aliases, and conflict handling |
| [src/worker.ts](src/worker.ts), [src/client.ts](src/client.ts) | Worker-owned editor and request-ID-based message interface |
| [src/App.tsx](src/App.tsx), [src/styles.css](src/styles.css) | File workflow, responsive editor, dialogs, and localized UI |
| [src/assets/demo.sav](src/assets/demo.sav) | Synthetic demo imported as a bundled asset using `?url` |
| [tests/core.test.ts](tests/core.test.ts), [tests/e2e/editor.spec.ts](tests/e2e/editor.spec.ts) | Core regression checks and browser flows |
| [tests/fixtures/](tests/fixtures/) | Six synthetic engine-generated saves and CSV label data |
| [tests/reference/](tests/reference/), [scripts/](scripts/) | Original C# save code, test adapter, fixture generation, and comparison scripts |
| [vite.config.ts](vite.config.ts), [playwright.config.ts](playwright.config.ts) | Relative asset base, core test selection, and browser preview setup |
| [.github/workflows/pages.yml](.github/workflows/pages.yml) | Unit and browser checks, production build, and GitHub Pages deployment from `main` |
| [src/messages.ts](src/messages.ts), [src/i18n.ts](src/i18n.ts), [src/locale.tsx](src/locale.tsx) | Bundled translations, interpolation/plurals, URL/browser language selection, and React locale context |
| [src/core/diagnostic.ts](src/core/diagnostic.ts) | Locale-independent error and warning descriptors passed through the Worker |
| [tests/i18n.test.ts](tests/i18n.test.ts), [tests/e2e/i18n.spec.ts](tests/e2e/i18n.spec.ts) | Translation completeness, locale selection, and state preservation across languages |

## Implementation invariants

1. Store save integers as `bigint`. Use decimal strings for input, display, and UI-facing results; never convert save values through JavaScript `number`.
2. Treat the parsed document and its original bytes as immutable. `Editor.edits` overlays values; a separate resize overlay stores binary array dimensions. Resizing keeps coordinates, type, and rank. Out-of-bounds values and edits stay in memory for restoration but are excluded from export, queries, and active change counts. `Editor.reset()` clears both overlays. A variable's `id` is its position in `document.variables`; `scope === -1` means shared/global, otherwise scope is the character's position, not its `NO` value. Scalar keys are `''`; array keys are comma-separated coordinates such as `'1,2,3'`.
3. Keep arrays sparse. Missing binary cells mean `0n` or `''` within current bounds. Query pages contain at most 50 rows, including array size changes in the changes view; pagination, resizing, and export validation must not expand an entire sparse array.
4. Export by patching edited text value spans or re-encoding only changed binary variables. Preserve untouched bytes, headers, variable order, BOM, and line endings. No-op and fully reverted exports must be byte-identical to the input.
5. Reparse the exact export and verify variable structure against the intended dimensions and all logical values within those bounds before returning it. Keep integer, encoding, bounds, malformed-file, and resource-limit checks. Reject unsupported versions/tags rather than guessing a layout.
6. Text cells are editable only when they have entries in `textSpans`. Do not invent trailing array sizes or fill gaps in ragged text arrays. Reject reserved text delimiters, line breaks, NUL, and characters that cannot round-trip through the original encoding.
7. A Worker `open` request replaces the current editor only after the new save parses successfully. Failed opens must preserve the existing session. Keep the heavy processing in the Worker.
8. CSV names are optional display metadata. They must not change save structure or values; conflicts retain the first loaded name and produce warnings.
9. Keep the editor and Worker locale-independent. `MessageError` carries a plain `Message` descriptor; translate it in the UI at render time. `Row.scopeName` and character summary names contain only save data and may be empty; shared/global and unnamed-character labels are UI fallbacks. A language change must not reopen a save, reset edits, translate user content, or alter serialization. Language preference is stored only in the URL (`lang`), with browser detection and English fallback.

Resource limits currently include 64 MiB per file, 100 million cells per binary array, 1 million stored values, 1 million text lines, 200,000 variables, and 100,000 characters. Keep these limits effective when changing parsing or iteration.

## Format pitfalls

- Binary files begin with `89 45 52 41 0D 0A 1A 0A`. Version 1808 uses little-endian numbers and **UTF-16LE** strings with .NET 7-bit encoded **byte-length** prefixes. Do not replace this with UTF-8 or a character count. Only normal/global file types are supported.
- Text saves use engine syntax, not generic CSV parsing. Preserve the fixed legacy variable order and literal `__FINISHED`, `__EMU_SEPARATOR__`, and `__EMUERA_*_STRAT__` markers. `STRAT` is the engine's spelling. The 1700 marker is `__EMUERA_STRAT__`; later recognized markers are 1708, 1729, 1803, and 1808.
- Text multidimensional string arrays are unsupported by the reference engine. Binary arrays and ragged numeric text arrays have different shape/editability rules.
- Automatic text detection tries strict UTF-8 before CP932/Shift-JIS. A manual override is needed for ambiguous byte sequences. CSV imports use the selected encoding too; never silently substitute unrepresentable characters during export.
- CSV comments are whole lines starting with `;`; `;!;` activates the remainder of a line. A semicolon inside a label is literal. Standard filename families and aliases live in `labels.ts`. Lookups for format markers and CSV families must exclude inherited object properties.

## Validation and handoff

Use the change-specific checks in [CONTRIBUTING.md](CONTRIBUTING.md). Build before browser tests: Playwright serves `dist/`, including the Worker and demo asset. Parser/serializer/encoding work also needs the .NET reference comparison when the SDK is available; report it explicitly if unavailable.

The committed fixtures are synthetic. The reference test compares the original C# reader's full value dictionaries before and after edits, so do not replace it with a check that only uses our own codec. Keep `tests/reference/upstream/` sources and their license unchanged; adapters are separate. These checks exercise save-code compatibility, not a running game or every fork.

Maintain `AGENTS.md` and `CONTRIBUTING.md` in English. Keep README files and their `.ko.md` / `.ja.md` translations synchronized. Documentation-only changes need link and content checks, not application test reruns. In the handoff, describe observable changes, checks performed, and any remaining compatibility or verification limits.
