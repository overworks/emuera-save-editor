# Binary character operations

The editor duplicates and deletes characters in existing normal binary saves. These operations edit saved records; they do not run `ADDCHARA`, `ADDCOPYCHARA`, `DELCHARA`, game scripts, or character initialization. Usage is documented in the [README](../README.md#duplicating-and-deleting-characters).

## Source evidence

All links pin the Emuera 1.824 baseline at commit `85db4cbd5eb2efe6c5b5449ada351a21a20db60b`:

- [VariableEvaluator.cs](https://github.com/0x00000FF/Emuera/blob/85db4cbd5eb2efe6c5b5449ada351a21a20db60b/Emuera/GameData/Variable/VariableEvaluator.cs): `SaveToStreamBinary` writes the signed 64-bit character count before ordered character blocks, followed by shared variables. `LoadFromStreamBinary` creates that many characters in the same order. `AddCopyChara` appends a new character and copies the source into it. `DelCharacter` removes a list element; it does not repair all game references. `PickUpChara` and sorting code explicitly update TARGET, ASSI and MASTER as characters move.
- [CharacterData.cs](https://github.com/0x00000FF/Emuera/blob/85db4cbd5eb2efe6c5b5449ada351a21a20db60b/Emuera/GameData/Variable/CharacterData.cs): binary character serialization ends each character with EOC (`0xfe`) and separates built-in and user-defined records with an optional separator (`0xfd`). Saved NO is a character value, not the character's list position.
- [VariableCode.cs](https://github.com/0x00000FF/Emuera/blob/85db4cbd5eb2efe6c5b5449ada351a21a20db60b/Emuera/GameData/Variable/VariableCode.cs) and [VariableData.cs](https://github.com/0x00000FF/Emuera/blob/85db4cbd5eb2efe6c5b5449ada351a21a20db60b/Emuera/GameData/Variable/VariableData.cs): TARGET, ASSI, MASTER and PLAYER are integer 1D variables whose first cell denotes a registered character position. RELATION uses character template numbers; its indices are not shifted when characters are removed.

The editor's reference repair is an explicit preservation policy based on these meanings. It is not a claim that raw `DELCHARA` repairs these four variables, or that every game stores references only there.

## Identity and copying

Original character IDs equal their original positions. Copies receive monotonically increasing IDs that are not reused after cancellation/reset. Variables have separate stable IDs. Current export positions are computed from surviving originals followed by copies in creation order. `CharacterSummary.scope` is the stable ID, and `index` is the current position (null when deleted). The UI displays positions, not internal IDs.

A copy snapshots a validated current export, including active value edits, resized bounds, variable additions/deletions, names, NO, and section markers. Only the selected character block is retained in the copy. Later source edits do not affect it. Copied variables are baseline records within that copy, so the changes view shows one character addition rather than marking every copied variable as newly added. Further edits and variable operations on the copy are tracked normally. Hidden cells outside current array bounds and already deleted variables are not copied.

Deleting an original hides its whole block and all related edit overlays. Restoring it recovers those overlays at the original relative position. Deleting a copy cancels its block and edits. Empty characters and deletion of every character are supported. Global saves and creation without a source character are excluded. [Text character operations](text-characters.md) share these identity and reference rules, with separate block and stored-cell handling.

## Standard references

Only cell `0` of shared integer 1D variables named TARGET, ASSI, MASTER or PLAYER is remapped (case-insensitive names). Existing in-range values bind to original character IDs. A manually entered in-range value binds to the character at that current position. A new reference variable's default zero binds to the first active character, when present. Bindings use decimal-string position lookups, so save integers never pass through JavaScript `number`.

On export/display, a binding yields its target's current position, or `-1` if the target is deleted/cancelled. Restoring a deleted original makes the binding valid again. Manual edits replace the binding; restoring a character must not discard a newer manual choice. Negative and out-of-range values remain exact bigint literals, even if a later copy makes that numeric position valid. Hidden reference cells in zero-length arrays remain hidden until the array is expanded again.

The delete dialog previews affected references. Automatic reference changes appear as value rows, with editing available; their restoration follows character undo. Value undo clears a manual reference override and resumes its original binding. Custom references, other cells, similarly named scalar variables, NO, and RELATION indices are unchanged. The app cannot infer or repair game-specific references stored in arbitrary variables or strings.

## Bytes, limits and independent checks

The parser records the character count offset, block starts/ends, separators, and start of shared records. Export patches the count, omits deleted blocks, and inserts copied blocks before shared records. Existing blocks preserve untouched bytes. Copies retain their snapshot bytes except for subsequent edits. Insertions precede replacements at the same byte boundary, including when the first shared record is also edited or deleted. Reverting all changes restores byte-identical input.

Every export is reparsed and compared with intended active records using stable variable IDs and the current character-position map. The checks cover character count, variable order, scope, section, type, dimensions and all logical values. Copying is sparse and checks the 100,000-character, 200,000-variable, 1-million-stored-value and 64-MiB-file limits before adding the copy. The existing 100-million-cell array limit remains in force.

[Unit tests](../tests/characters.test.ts) cover edited copies, copies of copies, hidden edits, CSV identity, reference overrides, out-of-range bigint references, all-character deletion, empty/unseparated blocks, insertion boundaries, stale IDs, pagination and the character limit. A synthetic fixture builder also supports [browser tests](../tests/e2e/characters.spec.ts) for actual dialogs, reference previews, download/reopen, invalid opens, offline language changes, and mobile layouts in all three languages.

The [reference check](../scripts/reference-check.ts) generates a separate temporary fixture with the unchanged original C# writer. Its three characters include an empty block and a block without a separator, along with all four standard references, an unknown game reference, and exact 64-bit extremes. Six scenarios compare the original C# reader's complete dictionaries, dimensions, character count and record/marker sequence against explicitly constructed expectations. They exercise edited copies and deletion, all-character deletion, empty/unseparated copies, manual reference restoration, references to copies, and cancellation of a referenced copy. This is save-code validation, not in-game loading or execution of game-specific logic.
