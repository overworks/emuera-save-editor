# Game preset metadata

Game presets provide a small curated set of localized field names, explanations, and navigation shortcuts. They describe coordinates in an already parsed save. Selecting a preset does not edit values, import CSV files, resize arrays, add variables, or execute game scripts. The user guide is in the [README](../README.md#game-presets).

## Source editions

Each preset is pinned to a public source revision. The catalog contains independently written descriptions and coordinate mappings; game files are not bundled or fetched at runtime.

| Preset | Source revision | Game code | Source game version |
| --- | --- | --- | --- |
| eraTWKR Textbung, based on TWKR 1.20 | [`567ecd2`](https://github.com/keisiki/TWKR-Textbung/tree/567ecd2778fe36cb30c552fd5a57e988520cedfc) | `7153` | `GameBase.csv` says `proto`, so no numeric version match is claimed |
| eratohoK 1.29.3 | [`3699706`](https://github.com/wamekukyouzin/eratohoK/tree/36997067a3ac537cff3178b27da8ea8244dd9a9e) | `9224517` | `12903` |
| eraMegaten KR Rev.143 | [`da99244`](https://github.com/cobaltmist/eraMegaten_KR/tree/da99244642e27095fcce2c5676099cec5e88d2cf) | `666` | `00309143`, represented as decimal `309143` in saves |
| ShinEraTenseiP 0.5.9 | [`6e9479a`](https://gitgud.io/bazzile/eramegaten_p/-/tree/6e9479a97e5a42f3e726c203652bd2f169e38c30) | `666` | `000509309154`, represented as decimal `509309154` in saves |

The respective [TWKR](https://github.com/keisiki/TWKR-Textbung/blob/567ecd2778fe36cb30c552fd5a57e988520cedfc/CSV/GameBase.csv), [K](https://github.com/wamekukyouzin/eratohoK/blob/36997067a3ac537cff3178b27da8ea8244dd9a9e/CSV/GameBase.csv), [Megaten](https://github.com/cobaltmist/eraMegaten_KR/blob/da99244642e27095fcce2c5676099cec5e88d2cf/CSV/GameBase.csv), and [ShinEraTenseiP](https://gitgud.io/bazzile/eramegaten_p/-/blob/6e9479a97e5a42f3e726c203652bd2f169e38c30/Data/CSV/GameBase.csv) game definitions supply those identifiers. A unique code/version match takes priority for suggestions. If several presets share a code and no single version matches, no candidate is suggested; the catalog never chooses one by list order. A unique game code can still suggest an edition with an unverified version. Suggestions do not select a preset automatically. Matching code and version is not proof of an identical patch or game compatibility. Users can manually select another preset; the UI identifies a different code or an unverified version.

## Coordinate evidence

All catalog fields are integer one-dimensional arrays. `MONEY` belongs to shared scope; `BASE`, `MAXBASE`, and `ABL` belong to character scope. A key following the colon is an array index, never a character position or `NO`.

| Edition | Base fields | Abilities |
| --- | --- | --- |
| TWKR Textbung | `BASE:0` stamina, `BASE:1` energy; corresponding `MAXBASE:0` and `MAXBASE:1` limits | `ABL:42` combat, `ABL:44` cooking, `ABL:45` music |
| eratohoK | `BASE:0` stamina, `BASE:1` energy, `BASE:2` mental strength; `MAXBASE:0` and `MAXBASE:1` limits | `ABL:53` politics, `ABL:60` singing, `ABL:61` cooking |
| Megaten KR | `BASE:5` HP, `BASE:6` MP, `BASE:7` experience, `BASE:8` MAG; `MAXBASE:5` and `MAXBASE:6` limits | `ABL:12` cooking |
| ShinEraTenseiP 0.5.9 | `BASE:5` HP, `BASE:6` MP, `BASE:7` experience, `BASE:8` MAG; `MAXBASE:5` and `MAXBASE:6` limits | `ABL:12` cooking |

The mappings come from each pinned edition's CSV definitions:

- TWKR: [Base.csv](https://github.com/keisiki/TWKR-Textbung/blob/567ecd2778fe36cb30c552fd5a57e988520cedfc/CSV/Base.csv), [Abl.csv](https://github.com/keisiki/TWKR-Textbung/blob/567ecd2778fe36cb30c552fd5a57e988520cedfc/CSV/Abl.csv).
- K: [Base.csv](https://github.com/wamekukyouzin/eratohoK/blob/36997067a3ac537cff3178b27da8ea8244dd9a9e/CSV/Base.csv), [Abl.csv](https://github.com/wamekukyouzin/eratohoK/blob/36997067a3ac537cff3178b27da8ea8244dd9a9e/CSV/Abl.csv).
- Megaten: [Base.csv](https://github.com/cobaltmist/eraMegaten_KR/blob/da99244642e27095fcce2c5676099cec5e88d2cf/CSV/Base.csv), [Abl.csv](https://github.com/cobaltmist/eraMegaten_KR/blob/da99244642e27095fcce2c5676099cec5e88d2cf/CSV/Abl.csv).
- ShinEraTenseiP: [Base.csv](https://gitgud.io/bazzile/eramegaten_p/-/blob/6e9479a97e5a42f3e726c203652bd2f169e38c30/Data/CSV/Base.csv), [Abl.csv](https://gitgud.io/bazzile/eramegaten_p/-/blob/6e9479a97e5a42f3e726c203652bd2f169e38c30/Data/CSV/Abl.csv). These coordinates were checked separately against the P branch.

The TWKR [shop display](https://github.com/keisiki/TWKR-Textbung/blob/567ecd2778fe36cb30c552fd5a57e988520cedfc/ERB/SHOP관련/SHOP_t.ERB#L72) and Megaten [shop display](https://github.com/cobaltmist/eraMegaten_KR/blob/da99244642e27095fcce2c5676099cec5e88d2cf/ERB/ＳＨＯＰ関連/SHOP.ERB#L827) identify unindexed `MONEY` (element zero) as shared funds. The latter also distinguishes `MONEY:1`; this preset does not relabel every money cell. Its [MAG display](https://github.com/cobaltmist/eraMegaten_KR/blob/da99244642e27095fcce2c5676099cec5e88d2cf/ERB/ＳＨＯＰ関連/SHOP.ERB#L556) identifies magnetite. `MAXBASE` uses the same CSV indices as `BASE`, consistent with the baseline engine and the existing [CSV metadata handling](csv-metadata.md).

Descriptions identify stored values only. They do not promise valid ranges, recalculate dependent stats, or infer game rules from a CSV label. Additional releases and forks need separate source review.

ShinEraTenseiP's [shop display](https://gitgud.io/bazzile/eramegaten_p/-/blob/6e9479a97e5a42f3e726c203652bd2f169e38c30/Data/ERB/ＳＨＯＰ関連/SHOP.ERB#L705) independently confirms `MONEY:0` as shared funds, distinct from `MONEY:1`. Its [README](https://gitgud.io/bazzile/eramegaten_p/-/blob/6e9479a97e5a42f3e726c203652bd2f169e38c30/README.md) requires .netEmuera scripting extensions. This metadata preset does not add engine-specific save parsing or claim in-game verification.

## Runtime behavior

[presets.ts](../src/presets.ts) stores the catalog, resolves shortcuts against current variable summaries, and matches names and explanations in the current UI language. [GamePresets.tsx](../src/GamePresets.tsx) renders the selector, edition evidence, and shortcuts. Translations stay in [messages.ts](../src/messages.ts).

Character shortcuts require an explicitly selected stable character ID. Shared shortcuts navigate to shared scope. Wrong types, ranks, bounds, deleted variables, and character user-defined sections do not match. Copies use their own variable IDs. Navigation changes only scope, variable filter, search, and the current view.

The UI sends matching coordinates with the query; the Worker remains locale-independent. Metadata matches extend label searches inside existing filters and the 50-row page limit. They do not enumerate an entire sparse binary array. Text matches are restricted to existing `textSpans`. Qualified references and `_Rename.csv` expansion retain their existing interpretation.

CSV names remain primary, with preset guidance shown separately. Both remain searchable. Switching presets preserves edits, CSV metadata, and search text. A successful save open clears the selection; a failed open preserves it. Presets and translations are bundled and work offline after loading. The selected preset is included in optional local session recovery; language preference remains only in the URL.

## Validation scope

[Unit tests](../tests/presets.test.ts) cover scope/type/rank matching, stable character IDs, resized bounds, sparse searches, pagination, change filters, text omissions, CSV aliases, byte-identical metadata-only exports, and shared game codes with distinct or unknown versions. [Browser tests](../tests/e2e/presets.spec.ts) cover all three languages, mobile widths, offline operation, CSV precedence, preset switching, exact 64-bit editing, failed/successful opens, and ShinEraTenseiP suggestions and shortcuts.

[Fixtures](../tests/preset-fixture.ts) are synthetic and only borrow the public game identifiers to exercise suggestions. These checks do not establish in-game loading of edited saves or compatibility with every edition. The existing standard Emuera parser restrictions, including unsupported EM/EM+EE formats, still apply.
