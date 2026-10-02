# CSV metadata semantics

This document records the supported subset and its source evidence. For usage, see the [user guide](../README.md#csv-labels-and-encoding). Implementation and regressions live in [labels.ts](../src/core/labels.ts), [editor.ts](../src/core/editor.ts), and [labels.test.ts](../tests/labels.test.ts).

## Baseline source evidence

The baseline is Emuera 1.824, commit `85db4cbd5eb2efe6c5b5449ada351a21a20db60b`:

- [ParserMediator.LoadEraExRenameFile](https://github.com/0x00000FF/Emuera/blob/85db4cbd5eb2efe6c5b5449ada351a21a20db60b/Emuera/GameData/ParserMediator.cs): the left column supplies replacement text; the right column becomes a `[[token]]`. The loader trims both columns and handles escaped commas before splitting the final segment.
- [EraStreamReader.ReadEnabledLine](https://github.com/0x00000FF/Emuera/blob/85db4cbd5eb2efe6c5b5449ada351a21a20db60b/Emuera/Sub/EraStreamReader.cs): when renaming is enabled, literal, case-sensitive string replacements run in dictionary enumeration order. It does not repeatedly expand until reaching a fixed point.
- [ConstantData.loadCharacterDataFile / toCharacterTemplate](https://github.com/0x00000FF/Emuera/blob/85db4cbd5eb2efe6c5b5449ada351a21a20db60b/Emuera/GameData/ConstantData.cs): `CHARA*.CSV` declares a signed 64-bit `NO` or `番号` before name fields. Character names are the second comma-separated column. The name-to-index dictionary for `RELATION` uses the template's number and its name, call name, and nickname. The CSV loaders create `EraStreamReader(false)`, so CSV content does not undergo `_Rename.csv` substitution.

These sources inform parsing tests; the browser does not run these engine loaders or game scripts. The separate [.NET save-code comparison](../tests/reference/README.md) verifies that importing metadata does not affect saved values or bytes.

## Character names

Filenames are matched without case sensitivity after stripping directory components. `Chara*.csv` accepts these fields:

| Field | Japanese spelling | Use |
| --- | --- | --- |
| `NO` | `番号` | Exact signed 64-bit identifier; never infer it from the filename |
| `NAME` | `名前` | Reference name and preferred `RELATION` label |
| `CALLNAME` | `呼び名` | Call name; fallback when the reference name is empty |
| `NICKNAME` | `あだ名` | Nickname; fallback after the call name |
| `MASTERNAME` | `主人の呼び方` | The character's name for their master |

The loader preserves name text, including spaces and literal semicolons. Standard whole-line comments and `;!;` enabled lines follow the existing label loader. Name fields preceding a valid number are skipped with a warning. Stats and other fields are ignored; no character, variable, default value, or array size is created.

The current saved `NO`, including an edited value, selects a profile. The saved `NAME` remains the primary character heading and scope name. CSV text appears separately, in scalar name/NO labels and the character metadata panel. `RELATION` searches also match call names and nicknames, while showing the preferred reference name. Array bounds, sparse pagination, text spans, and change filters still apply.

Duplicate numbers keep the entire first profile; later files do not fill gaps in it. Conflicting nonempty name fields within one file keep the first name. This is the editor's first-wins metadata policy, not a claim that every engine duplicate/compatibility setting behaves this way. SP character variants with the same NO cannot be distinguished without game configuration.

## Search substitution

`_Rename.csv` parsing follows the baseline's column syntax, not generic quoted CSV:

```text
; replacement,token
ABL:0,focus
0,skill
text\,with\,commas,description
```

Searching `[[focus]]` or `ABL:[[skill]]` selects `ABL:0` in the current scope. A replacement may also be a variable name, ordinary label search, or numeric index. `TA:3:2:1` selects one array coordinate; `3:2:1` retains the existing index-only search. A qualified reference uses the selected scope, and its numeric components are array coordinates, not a leading character selector.

Only lines starting with `;` at column zero are comments in `_Rename.csv`, including `;!;` lines. Both columns are trimmed; a blank replacement is allowed. Escaped commas (`\,`) are reconstructed in the replacement. Following the baseline loader, only the first two columns of the last segment are used; additional columns are ignored. Quotes have no special meaning.

Rules replace every literal occurrence of their case-sensitive `[[token]]` once per rule, in import order. New tokens introduced by a replacement are processed only if their rule has not already run. Cycles do not trigger recursive expansion. Unknown tokens remain literal. Conflicts keep the first definition with a warning; this deliberately follows the editor's existing metadata policy rather than the engine loader's last-definition assignment.

Substitution applies to search input only. It does not rewrite CSV names, saved strings, variable names, scripts, or exports. Expressions, functions, symbolic array indices inside qualified references, and dynamic selectors such as `TARGET` are not evaluated. Search expansion is displayed so users can inspect what was searched.

## Limits and checks

CSV import requests may total 64 MiB over one save session, including repeated imports. Each file is limited to 1 million lines. Metadata is capped at 1 million entries (counting each character profile as five entries) and 100,000 character profiles. Oversized batches are rejected before importing them; malformed files produce source-aware warnings while earlier valid metadata remains available.

Expanded searches are limited to 1 million UTF-16 code units and 64 × 1024 × 1024 cumulative code units across rule inputs. These limits bound amplification and excessive work. A failed query clears the old result rows; direct searches remain available. Metadata and rules are reset on a successful save open, retained after failed opens, and never persisted.

Regression tests cover engine column direction, escaped commas, ordered replacement, conflicts, Unicode/CP932, exact 64-bit character identifiers, changing NO, sparse `RELATION` searches, resource limits, and byte-identical exports. Browser checks cover all three locales, narrow screens, offline switching, edited NO associations, and failed/successful save opens. Test CSVs contain synthetic metadata. They do not establish compatibility with every game's CSV extensions or scripts.
