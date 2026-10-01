import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
export const dotnet = process.env.DOTNET ?? 'dotnet';
const env = { ...process.env, DOTNET_CLI_TELEMETRY_OPTOUT: '1', DOTNET_NOLOGO: '1' };
export function buildOracle() {
  execFileSync(dotnet, ['build', 'tests/reference/Oracle.csproj', '-o', '.reference/bin', '--nologo', '--verbosity', 'quiet'], { env, stdio: 'inherit' });
}
export function runOracle(...args: string[]) {
  return execFileSync(dotnet, [resolve('.reference/bin/Oracle.dll'), ...args], { env, encoding: 'utf-8', maxBuffer: 32 * 1024 * 1024 });
}
