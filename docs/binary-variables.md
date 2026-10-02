# Binary variable records

This document explains the source evidence and implementation limits for adding and deleting variable records. User instructions are in the [README](../README.md#adding-and-deleting-binary-variables); the independent checks are described in [reference engine checks](../tests/reference/README.md).

## Baseline evidence

The baseline is Emuera 1.824 at commit `85db4cbd5eb2efe6c5b5449ada351a21a20db60b`. The following links pin that revision:

- [EraBinaryDataReader.cs](https://github.com/0x00000FF/Emuera/blob/85db4cbd5eb2efe6c5b5449ada351a21a20db60b/Emuera/Sub/EraBinaryDataReader.cs): `ReadVariableCode` reads a type tag and variable name, or a separator/end marker. Array readers consume saved dimensions independently of destination dimensions.
- [EraBinaryDataWriter.cs](https://github.com/0x00000FF/Emuera/blob/85db4cbd5eb2efe6c5b5449ada351a21a20db60b/Emuera/Sub/EraBinaryDataWriter.cs): `WriteWithKey`, `WriteSeparator`, `WriteEOC`, and `WriteEOF` define record and section output. Names and strings use UTF-16LE with byte-length prefixes.
- [CharacterData.cs](https://github.com/0x00000FF/Emuera/blob/85db4cbd5eb2efe6c5b5449ada351a21a20db60b/Emuera/GameData/Variable/CharacterData.cs): `SaveToStreamBinary` writes built-ins, then optional user-defined variables after a separator, then the character end marker. `LoadFromStreamBinary` changes lookup behavior after the separator; its 3D cases are commented out.
- [VariableData.cs](https://github.com/0x00000FF/Emuera/blob/85db4cbd5eb2efe6c5b5449ada351a21a20db60b/Emuera/GameData/Variable/VariableData.cs): binary shared/global loading resolves saved names against game declarations and handles scalars and ranks 1–3. There is no separate user-defined section for these records.

Character sections use `0xfd` for the transition to user-defined variables and `0xfe` to end a character; `0xff` ends the file. There is no per-section variable count to update. A record's tag carries its integer/string type and array rank.

## Supported operations

| Scope/section | New integer and string records |
| --- | --- |
| Shared/global | Scalar, 1D, 2D, 3D |
| Character built-in | Scalar, 1D, 2D |
| Character user-defined (`#DIM`/`#DIMS`) | 1D, 2D |

The editor supports these additions to existing normal/global binary saves. New arrays are sparse and default to zero/empty strings. Empty arrays are allowed. Existing record deletion works independently of the addition restrictions; it removes the complete record without changing character count or section markers.

The name input accepts Unicode letters or underscore initially, then letters, combining marks, numbers, or underscores, up to 128 UTF-16 units. Names are preserved as entered. Duplicate active names in a scope are rejected using uppercase comparison, including across character sections. Original duplicate records are preserved. Restoring a deleted original is rejected if an added record uses its name; cancel that addition first. This is a deliberately limited input policy, not an implementation of the engine's identifier/declaration parser.

Adding records does not create game variables, and deleting records does not delete declarations. The game's declarations, save eligibility, names, types, scope, rank, and target array sizes determine what gets loaded. The editor cannot determine those declarations from a save or CSV metadata. It does not guarantee a game will retain arbitrary additions when it next saves. Text variable addition/deletion remains unsupported. [Character duplication/deletion](binary-characters.md) is a separate normal-binary operation; variable operations also work within copied characters.

## Preservation and validation

The parser records character separators, character ends, and EOF byte offsets. Original variables keep their immutable IDs and byte spans. Additions use distinct, increasing editor IDs; IDs are not recycled after undo/reset. Deletions hide originals while keeping value/resize overlays available for restoration. Cancelling an addition removes its associated edits.

Export deletes original record spans and inserts new built-ins immediately before a character's separator, or its end if no separator existed. New user-defined records go before that character's end. If needed, export inserts one separator before the first new user-defined record; built-ins still precede it even when added later. Shared/global records go immediately before EOF. Existing markers and untouched bytes remain unchanged. Resetting all changes, or cancelling additions and restoring deletions, reproduces the original bytes.

The exact output is reparsed and compared with the intended active records in export order. The check includes headers, character count, names, scopes, character sections, types, dimensions, and all logical values using the original stable editor IDs. Sparse value unions avoid expanding large implicit arrays. Existing limits remain: 64 MiB per file, 100 million cells per binary array, 1 million stored values, and 200,000 active variables. Export reparsing enforces the stored-value limit too.

Unit tests exercise every shared type/rank, section placement with and without existing separators, empty scopes, restoration of edits and character identity, duplicate rejection, pagination, stale IDs, and large sparse arrays. Browser tests cover the dialogs, both scopes, export/reopen, invalid opens, offline language switching, and all three languages at mobile widths. Reference tests use the unchanged C# reader to compare complete values, saved dimensions, record type/order, separators, and character boundaries. They include a temporary synthetic fixture generated by the original writer with an empty character and a character without a user-defined section. These checks validate save-code compatibility, not execution in a game or fork.
