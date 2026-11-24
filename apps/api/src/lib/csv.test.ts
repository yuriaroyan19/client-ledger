import { describe, expect, it } from 'vitest';
import { escapeCsvCell, safeFilename, toCsvRow } from './csv.js';

describe('escapeCsvCell', () => {
  it('quotes separators, quotes and newlines', () => {
    expect(escapeCsvCell('a,b')).toBe('"a,b"');
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvCell('line1\nline2')).toBe('"line1\nline2"');
  });

  it.each(['=HYPERLINK("http://evil")', '+1+1', '@SUM(A1)', '-2+3', '\tcmd'])('neutralises formula injection in %j', (value) => {
    expect(escapeCsvCell(value).replace(/^"/, '').startsWith("'")).toBe(true);
  });

  it('keeps negative numbers numeric', () => {
    expect(escapeCsvCell('-25.00')).toBe('-25.00');
  });

  it('renders empty values as empty cells', () => {
    expect(toCsvRow(['a', null, undefined, 3])).toBe('a,,,3\r\n');
  });
});

describe('safeFilename', () => {
  it('strips header-breaking and path characters', () => {
    expect(safeFilename('Acme "Corp"/..\\x\r\n')).toBe('Acme-Corp-..-x');
    expect(safeFilename('Café Ünïcode')).toBe('Cafe-Unicode');
    expect(safeFilename('///')).toBe('export');
  });
});
