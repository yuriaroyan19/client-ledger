import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Entrypoints are excluded from coverage (they only wire process signals), so guard the wiring:
 * every script that package.json, the Dockerfile or docker-compose.yml runs must exist in src/.
 */
const apiRoot = resolve(import.meta.dirname, '../..');
const repoRoot = resolve(apiRoot, '../..');
const read = (path: string) => readFileSync(path, 'utf8');
const sourceOf = (distPath: string) => distPath.replace(/^dist\//, 'src/').replace(/\.js$/, '.ts');

describe('process entrypoints', () => {
  it('package.json scripts point at existing source files', () => {
    const scripts = (JSON.parse(read(resolve(apiRoot, 'package.json'))) as { scripts: Record<string, string> }).scripts;
    const referenced = Object.values(scripts).flatMap((command) => command.match(/src\/[\w/.-]+\.ts/g) ?? []);
    expect(referenced).toEqual(expect.arrayContaining(['src/server.ts', 'src/scripts/seed.ts', 'src/scripts/export-openapi.ts']));
    for (const file of referenced) expect(existsSync(resolve(apiRoot, file)), file).toBe(true);
    expect(existsSync(resolve(apiRoot, sourceOf(scripts.start?.replace('node ', '') ?? '')))).toBe(true);
  });

  it('docker-compose and the Dockerfile run compiled files that the build produces', () => {
    const compiled = [
      ...(read(resolve(repoRoot, 'docker-compose.yml')).match(/dist\/[\w/.-]+\.js/g) ?? []),
      ...(read(resolve(apiRoot, 'Dockerfile')).match(/dist\/[\w/.-]+\.js/g) ?? []),
    ];
    expect(compiled).toEqual(expect.arrayContaining(['dist/scripts/seed.js', 'dist/server.js']));
    for (const file of compiled) expect(existsSync(resolve(apiRoot, sourceOf(file))), file).toBe(true);
  });
});
