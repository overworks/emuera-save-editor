import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

// Hash every shipped asset, including the editor Worker and bundled sample.
// Relative URLs keep the same build usable at / and at a static host's subpath.
export function offlineWorker(files: Map<string, Uint8Array>, source: string): string {
  const assets = [...files].filter(([name]) => name !== 'sw.js').sort(([a], [b]) => a.localeCompare(b))
    .map(([url, bytes]) => ({ url, integrity: `sha256-${createHash('sha256').update(bytes).digest('base64')}` }));
  const manifest = JSON.stringify(assets);
  const version = createHash('sha256').update(source).update(manifest).digest('hex').slice(0, 24);
  return `const VERSION = ${JSON.stringify(version)};\nconst ASSETS = ${manifest};\n${source}`;
}

async function build() {
  const root = new URL('../dist/', import.meta.url);
  const files = new Map<string, Uint8Array>();
  async function collect(directory = ''): Promise<void> {
    for (const entry of await readdir(new URL(directory, root), { withFileTypes: true })) {
      const name = directory + entry.name;
      if (entry.isDirectory()) await collect(`${name}/`);
      else if (entry.isFile() && name !== 'sw.js') files.set(name, await readFile(new URL(name, root)));
    }
  }
  await collect();
  const source = await readFile(new URL('./offline-worker.js', import.meta.url), 'utf8');
  await writeFile(new URL('sw.js', root), offlineWorker(files, source));
  console.log(`Offline app: ${files.size} assets with verified contents.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await build();
