# Text character operations

Normal text saves support character duplication and deletion with the same stable identities, snapshot semantics, restoration, and standard reference policy as [binary character operations](binary-characters.md). The UI and Worker use the same character commands. Global saves and creation without a source character remain excluded; [named text extension variable addition/deletion](text-variables.md) is supported separately, while text array resizing remains unsupported. See the [user guide](../README.md#duplicating-and-deleting-characters).

## Source evidence

The following sources pin Emuera 1.824 at commit `85db4cbd5eb2efe6c5b5449ada351a21a20db60b`:

- [VariableEvaluator.cs](https://github.com/0x00000FF/Emuera/blob/85db4cbd5eb2efe6c5b5449ada351a21a20db60b/Emuera/GameData/Variable/VariableEvaluator.cs), `SaveToStream` and `LoadFromStream`: the header contains the character count. All character base blocks precede the shared base values. After the extension marker, all character extension blocks precede shared extensions. Loading uses the same character count for both passes.
- [CharacterData.cs](https://github.com/0x00000FF/Emuera/blob/85db4cbd5eb2efe6c5b5449ada351a21a20db60b/Emuera/GameData/Variable/CharacterData.cs), `SaveToStream`, `SaveToStreamExtended`, and both extended loaders: base values have fixed order. Extended scalars and arrays are separated by type and rank. Character extensions before 1803 have four sections; 1803 and 1808 have six, including the empty multidimensional string section.
- [EraDataStream.cs](../tests/reference/upstream/EraDataStream.cs), `SeekEmuStart` and extended array readers: recognized versions are 1700, 1708, 1729, 1803, and 1808. Shared numeric 2D and 3D sections begin at 1708 and 1729 respectively. Numeric rows can be ragged, and trailing default values can be omitted. The 1700 marker is spelled `__EMUERA_STRAT__`.
- [VariableData.cs](https://github.com/0x00000FF/Emuera/blob/85db4cbd5eb2efe6c5b5449ada351a21a20db60b/Emuera/GameData/Variable/VariableData.cs), `LoadFromStreamExtended`: shared user-defined array sections are present from 1808 onward.

These operations change stored records and do not run character initialization or game scripts. Reference adjustment is an editor policy, not a claim about generic `DELCHARA` behavior or arbitrary game references.

## Blocks and copied cells

`SaveDocument.textLayout` records the count value span, each character's base and optional extension spans, shared insertion boundaries, and line counts. Character spans include their existing line terminators. `Variable.textSection` distinguishes base and extended records so export validation can order both passes correctly, including copies with new stable scope IDs.

A copy snapshots the validated current export using the document's selected encoding, even if those bytes would also pass UTF-8 detection. It retains both character blocks, empty extension sections, NAME, NO, all stored values, ragged rows, and omitted cells. Its variables and every `textSpans` entry are relocated into the copy's own byte buffer. Further edits to the source or copy remain independent. Copying a copy and cancelling its source work the same way.

Deleting an original omits both spans and hides its edits until restored. Copies are appended at the end of the active character order in both passes. Copies include current text extension additions/deletions and relocate their insertion groups; existing array shapes and ragged cells remain unchanged. An export is reparsed and checked for format/version, encoding, headers, count, variable order, scopes, sections, dimensions, stored-cell membership, and all logical values.

## References and byte preservation

Only existing cell `0` of shared integer 1D TARGET, ASSI, MASTER, and PLAYER participates in reference binding. The cell must have a text span. If the engine omitted a reference's zero value, the editor leaves it omitted rather than introducing a new cell. Deletion previews and the changes view show the actual stored-cell adjustments; the text delete dialog explains this limitation. Custom references, NO, RELATION indices, other cells, and negative/out-of-range literals remain unchanged.

Export patches the count only when the active count differs, omits deleted blocks, inserts copies at both shared boundaries, and patches active cell values. It retains original encoding, BOM, markers, integer spelling outside edits, line endings, and the final-newline state. Mixed line endings need one boundary rule: a bare CR followed by an LF after deletion, insertion, or an empty-string edit would collapse two lines. An extra LF at that new boundary preserves both lines. Existing CRLF pairs are never split. No-op exports and complete undo remain byte-identical, including noncanonical count spelling.

Copies are checked before mutation against the character, variable, stored-value, byte, and text-line limits. Export reparsing enforces the same limits, including text with no final newline. Text editing still rejects reserved markers, line breaks, NUL, and strings that cannot round-trip through the original encoding.

## Verification

[Unit tests](../tests/text-characters.test.ts) cover all recognized layouts, empty names and extension sections, independent edited snapshots and copies of copies, manual and automatic references, omitted references, exact undo, character count width changes, simultaneous shared edits, ambiguous CP932 bytes, ragged cell restrictions, CR/LF joins, and line-limit rejection without partial additions. [Browser tests](../tests/e2e/text-characters.spec.ts) cover UTF-8/CP932 downloads and reopening, deletion previews, final-character deletion and restoration, invalid opens, offline language changes, and narrow layouts in all three languages.

The [reference adapter](../tests/reference/Program.cs) generates temporary three-character text fixtures with the unchanged original C# writer primitives and reads them with the original reader. Eight version/encoding/line-ending combinations each run six scenarios: edited copies and deletion, references to copies of copies, cancellation of a referenced copy, empty names/sections, deletion of every character, and manual reference restoration. The [comparison script](../scripts/reference-check.ts) constructs expected full dictionaries and record order from C# dumps with explicit value edits and scope remapping. It checks exact reset and leaves committed fixtures and upstream sources unchanged. These checks validate save-code behavior, not in-game reloads or every historical game/fork.
