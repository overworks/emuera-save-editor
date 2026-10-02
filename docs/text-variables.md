# Text extension variable records

Named extension records in normal/global text saves support addition and deletion. Fixed-order base variables remain mandatory, and existing arrays cannot be resized. The [user guide](../README.md#adding-and-deleting-text-extension-variables) describes the controls.

## Source evidence and groups

The baseline is Emuera 1.824 at commit `85db4cbd5eb2efe6c5b5449ada351a21a20db60b`:

- [EraDataStream.cs](../tests/reference/upstream/EraDataStream.cs), `ReadStringExtended`, `ReadInt64Extended`, and the extended array readers: scalars use a name followed by a colon and value; arrays use a name line, values, and `__FINISHED`. Each type/rank dictionary ends at `__EMU_SEPARATOR__`. Numeric 2D rows may be ragged; 3D planes use braces. Nonempty multidimensional string groups are rejected by the original reader.
- [CharacterData.cs](https://github.com/0x00000FF/Emuera/blob/85db4cbd5eb2efe6c5b5449ada351a21a20db60b/Emuera/GameData/Variable/CharacterData.cs), `SaveToStream`, `SaveToStreamExtended`, `LoadFromStreamExtended`, and `LoadFromStreamExtended_Old1802`: base values have fixed order; named character extensions contain built-in scalar/string/integer groups, followed by 2D groups from 1803. Text character saving has no user-defined character section.
- [VariableData.cs](https://github.com/0x00000FF/Emuera/blob/85db4cbd5eb2efe6c5b5449ada351a21a20db60b/Emuera/GameData/Variable/VariableData.cs), `SaveToStreamExtended`, `LoadFromStreamExtended`, and the global save/load methods: shared built-ins and user-defined arrays are read separately. User-defined shared/global array groups are available from 1808. A record in the wrong group does not become a declaration or change how the game resolves it.

The parser recognizes markers 1700, 1708, 1729, 1803 and 1808. Shared built-ins allow scalars and 1D arrays, numeric 2D from 1708, and numeric 3D from 1729. Character built-ins allow scalars and 1D arrays, plus numeric 2D from 1803. The 1808 shared/global user-defined groups allow numeric ranks 1–3 and string rank 1. Global text extensions require 1808. No extension marker is inserted or upgraded by an addition.

These operations change saved records, not game declarations or initialization. Unknown names may be ignored, omitted names may retain game defaults, and target sizes come from game declarations. Save-code verification does not establish game loading for arbitrary record names.

## Representation and export

`SaveDocument.textLayout.groups` records scope, built-in/user-defined section, kind, rank, insertion boundary and the separator's line ending (or the nearest preceding ending if the final separator has none). Empty groups are retained. Extension variable spans include the name, array finish marker and final line ending; `textSpans` continue to locate only values. `Variable.section` is populated for text extensions as well as binary character records. The fixed base section has no such group.

New text arrays explicitly store every user-specified cell as zero or empty text; they do not infer sizes for original arrays. Their bounded record writer creates real value spans for query/edit membership. A new empty multidimensional record has all-zero dimensions because no shape header exists; partially empty shapes are rejected. New names use the existing 128-unit identifier policy, must round-trip through the selected encoding, and cannot be reserved delimiters. Active names cannot collide within a scope, ignoring case and group. Multidimensional string arrays, fixed base deletion, and unavailable version/group combinations are rejected.

Before committing an addition, the editor checks the stored-value budget, writes the candidate record, and validates the entire proposed export. A failure removes the candidate and leaves live edits and recovery history intact. The existing file, line and stored-value limits remain effective. New records can consume more space than the engine's writer would use because trailing default cells are intentionally explicit and editable. Original ragged rows and omitted cells remain unchanged.

Export inserts new records at the matching group's separator, removes complete deleted records, and patches original value spans. Original order within groups, separators, encoding, BOM, untouched bytes and existing line endings are preserved. New records use the group's ending. The existing CR/LF boundary rule still applies when copying or deleting character blocks. Reparse validation compares membership, group, order, scopes, types, shapes, stored-cell membership and all values using stable IDs.

Deletion retains an original's hidden edits until restored. Deleting an addition cancels it and its edits. Restoring a deleted name conflicts with an active addition of that name. Character copies snapshot current record membership and values, relocate both spans and insertion groups, and remain independent of later source edits. The existing validated session journal replays the same operations; the journal schema is unchanged. Reset or complete individual undo reproduces the original bytes.

## Verification

[Unit tests](../tests/text-structure.test.ts) cover all supported groups/ranks across recognized versions, both encodings, explicit zeros and blank strings, global records, empty groups/arrays, duplicate restoration, hidden edits, copied group relocation, ragged cells, mixed endings without a final newline, rejected input, pagination and exact undo. [Session tests](../tests/session.test.ts) cover replay of new/deleted records and independent copies. [Browser tests](../tests/e2e/text-structure.spec.ts) cover the controls, unavailable base operations, locale switching offline, failed opens, downloads, opted-in recovery and narrow dialogs in all three languages.

[The independent comparison](../scripts/reference-text-variables.ts), called by `npm run test:reference`, uses the four committed text fixtures and five temporary original-writer fixtures. It compares the original C# reader's complete dictionaries and ordered records, including built-in/user-defined group membership. Expectations are formed from the original reader's output plus planned additions, deletions and copies, not from our serializer's parsed output. Cases cover every recognized extension marker, UTF-8/CP932, mixed line endings, empty cells, normal/global records, copies, deleting all extensions and exact restoration. Committed fixtures and upstream engine sources remain unchanged.
