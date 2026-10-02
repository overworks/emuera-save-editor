# Contributing

This guide covers development and review. See the [README](README.md) for using the app and [AGENTS.md](AGENTS.md) for the code map and format-specific invariants.

## Development setup

Use Node.js 22.x (22.12 or newer), 24.x, or 26.x with npm. These versions satisfy the current build and test dependencies. Run commands from the repository root:

```sh
npm ci
npm run dev
```

The application uses React, TypeScript, and Vite. Keep dependency changes reflected in both `package.json` and `package-lock.json`. The .NET 8 SDK is optional unless you regenerate fixtures or run the reference engine checks; it is never a runtime requirement for the web app.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm test` | Run core tests with Vitest |
| `npm run build` | Check TypeScript and produce `dist/` |
| `npm run preview` | Serve the existing `dist/` build locally |
| `npm run test:e2e` | Run Playwright tests against the preview server |
| `npm run fixtures` | Regenerate synthetic saves and the bundled demo using the original engine writer; requires .NET 8 |
| `npm run test:reference` | Compare edited saves with the original engine reader; requires .NET 8 |

There is currently no separate lint or formatting command.

## Choosing checks

For implementation changes, run:

```sh
npm test
npm run build
```

For UI, Worker, file import/export, or asset-loading changes, also run the browser tests. Install Chromium once before the first run:

```sh
npx playwright install chromium
npm run test:e2e
```

Playwright serves the built `dist/` directory, so rebuild after changing source files. Its configured preview URL is `http://127.0.0.1:4173`. The suite covers file editing and reopening, binary array resizing, variable addition/deletion, text/binary character duplication/deletion and reference previews, undo, CSV labels and character metadata, search substitutions, encoding selection, offline operation, invalid inputs, mobile dialog behavior, and opt-in local recovery across reloads, storage errors and multiple tabs.

For parser, serializer, or encoding changes, also use the independent reference engine check with the .NET 8 SDK installed:

```sh
npm run test:reference
```

If `dotnet` is not on `PATH`, set its executable explicitly:

```sh
DOTNET=/absolute/path/to/dotnet npm run test:reference
```

Fixtures are committed, so ordinary development and `npm test` do not require .NET. Run `npm run fixtures` only when intentionally updating the synthetic test data: it overwrites six save fixtures and `src/assets/demo.sav`. Review those changes and rerun the relevant checks. See [reference engine checks](tests/reference/README.md) for provenance and limitations.

For documentation-only changes, check relative links, commands against `package.json`, and consistency across the three languages for README files. Application tests are not required for prose changes alone. State which checks were run and identify any relevant checks that could not be run.

## Development guidelines

- Keep format parsing, serialization, encoding, and editing logic in `src/core/`, independent of React and the DOM. Keep file processing in the Worker and use the typed messages in `src/worker.ts` through `src/client.ts`.
- Preserve exact signed 64-bit values, original bytes outside edited regions, sparse array handling, and validation before export. Follow the detailed invariants in [AGENTS.md](AGENTS.md).
- Keep user files in browser memory unless the user enables local session recovery. Maintain the static, browser-only architecture without adding upload services, external runtime assets, analytics, or incidental persistence. IndexedDB recovery must remain optional and off by default; do not store files or preferences elsewhere.
- Recovery changes need journal tests and browser checks for restoration, exact reset, disabled-by-default behavior, deletion, failed opens, quotas, unsupported records and stale-tab conflicts. Keep the original file and validated operations separate from exported bytes, and never replace undo history with an edited save. Wait for transaction completion before displaying success; keep live edits usable if storage fails.
- Follow the surrounding TypeScript style: strict types, two-space indentation, single quotes, and semicolons. Prefer existing abstractions and dependencies where they fit the change.
- Preserve keyboard navigation, accessible control names, dialog focus, error feedback, and narrow-screen usability. The product UI supports English, Korean, and Japanese; verify translated text at narrow widths too.
- Add regression coverage for meaningful behavior changes, especially save-format fixes. Use small synthetic examples instead of committing a user's save or game assets. Keep reference comparisons independent of the TypeScript serializer.
- CSV behavior is grounded in the baseline engine's loaders; see [CSV metadata semantics](docs/csv-metadata.md). Keep search substitution separate from save serialization, and test signed 64-bit character numbers and first-wins conflicts.
- Game presets require pinned source evidence for coordinates and edition identifiers; see [game preset metadata](docs/game-presets.md). Keep translations separate from saved data and CSV labels, and use synthetic fixtures. Check localized search, scope/type/rank/bounds matching, sparse pagination, byte-identical metadata-only exports, offline navigation, and failed/successful opens. Source review does not establish in-game compatibility.
- Binary variable operations must respect the engine's character sections and supported ranks; see [binary variable semantics](docs/binary-variables.md). Preserve stable editor IDs across deletions and validate record membership/order independently through the reference reader, including empty scopes and missing separators.
- Character operations must distinguish stable scope IDs from current save positions and preserve manual reference targets across deletion/restoration. See [binary character semantics](docs/binary-characters.md) and [text character semantics](docs/text-characters.md). Check exact reset, copied edits, empty characters, the last-character deletion, known reference adjustments, and untouched custom references using the independent reader. Text character changes also require coverage of both blocks, recognized extension versions, encoding overrides, omitted references, ragged cells, mixed line endings, and the text line limit.
- Preserve the unmodified engine sources and license under `tests/reference/upstream/`. Test host adaptations belong in `tests/reference/Program.cs`. An intentional baseline update must also update its provenance and compatibility documentation.
- Keep generated build/test output, local configuration, and credentials out of commits. `dist/`, `node_modules/`, `.reference/`, Playwright reports, and .NET build output are ignored; synthetic fixtures and the bundled demo are tracked deliberately.

## Interface translations

Add or update UI text in [src/messages.ts](src/messages.ts). Each entry contains English, Korean, and Japanese in that order; retain matching interpolation parameters and handle English singular/plural forms for counts. Use the locale provider instead of embedding visible text or accessibility labels in components. Keep errors and CSV warnings as structured messages from `src/core/diagnostic.ts` so existing messages can change language without reprocessing a save. Do not translate user data or turn saved 64-bit values into localized numbers.

Language precedence is URL, browser preferences, then English. The selector updates only the `lang` query parameter and does not use persistent browser storage. Keep translation resources bundled for offline switching. Translation changes should pass `npm test`, `npm run build`, and `npm run test:e2e`; the browser suite checks all three languages, state preservation, localized diagnostics, and mobile layouts.

## Documentation and translations

English is the default and canonical language for maintained project documentation. Only README files have Korean and Japanese translations. Maintain `AGENTS.md`, `CONTRIBUTING.md`, and other documentation in English.

| Audience | English | Korean | Japanese |
| --- | --- | --- | --- |
| Users | [README.md](README.md) | [README.ko.md](README.ko.md) | [README.ja.md](README.ja.md) |
| Reference test maintainers | [tests/reference/README.md](tests/reference/README.md) | [tests/reference/README.ko.md](tests/reference/README.ko.md) | [tests/reference/README.ja.md](tests/reference/README.ja.md) |

Update each README and its two translations together when content changes. Add language-switch links to README files and link to the matching language where a translation exists. Links to `AGENTS.md` and `CONTRIBUTING.md` always point to the English files. Keep commands, file paths, format markers, and actual UI labels unchanged; translated explanations may accompany them. Apply the same convention to new README files. Preserve third-party source comments and legal notices in their original form.

Avoid ASCII tildes in prose ranges: GitHub Markdown can treat matching single tildes as strikethrough. Use an en dash (`1–3`), words, or a locale-appropriate range mark instead. Escape a literal tilde (`\~`) or place it in code spans when needed. Check rendered Markdown as well as the source when reviewing formatting.

Keep usage, features, privacy, and user-visible limitations in README files; contributor workflows in CONTRIBUTING files; and repository navigation and implementation invariants in AGENTS files. Link between them instead of repeating full sections.

## Static hosting

Build and inspect the production bundle locally:

```sh
npm run build
npm run preview
```

Publish the entire `dist/` directory through an HTTP(S) static host, including all generated assets. The Vite configuration uses `base: './'` for relative asset paths, so the build can be served under a subdirectory. No backend API or routing rewrite rules are required. Verify the bundled sample and Worker in the hosted location. Direct `file://` use and offline reopening through a service worker are not supported.

The [GitHub Pages workflow](.github/workflows/pages.yml) publishes to [Emuera Save Studio](https://overworks.github.io/emuera-save-editor/) when changes are pushed to `main`. It uses Node.js 24, installs locked dependencies with `npm ci`, runs unit tests, builds the app, and runs the Chromium browser suite before uploading `dist/`. Deployment uses the `github-pages` environment. Actions are pinned to commit SHAs; update the SHA and version comment together when upgrading them.

For a fork or new repository, enable **Settings → Pages → Build and deployment → Source → GitHub Actions** once. Push to `main`, or select **Actions → Deploy to GitHub Pages → Run workflow** with `main` selected. The deployment job only publishes `main`. View the run and its deployment URL in Actions. After deployment, open the site at its full repository path and check the sample, save import/edit/download, and language switching. Keep the README links synchronized if the hosting address changes. See the [GitHub Pages workflow documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages) for the hosting requirements.

## Submitting changes

Keep changes focused. Describe the problem, resulting behavior, relevant compatibility limits, and checks performed. For UI changes, include enough visual evidence to review the behavior. For save-format changes, document the source evidence and add a reproducible synthetic case. Do not describe a successful format check as validation of all games or engine forks.
