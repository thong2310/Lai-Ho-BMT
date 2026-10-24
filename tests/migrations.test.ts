import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(process.cwd(), 'drizzle');
const journal = JSON.parse(readFileSync(resolve(root, 'meta/_journal.json'), 'utf8')) as { entries: { tag: string }[] };
const files = journal.entries.map(entry => readFileSync(resolve(root, `${entry.tag}.sql`), 'utf8'));
const sql = files.join('\n');
function declarations(pattern: RegExp) { return [...sql.matchAll(pattern)].map(match => match[1]); }
describe('committed migration chain static regression', () => {
  it('creates each application table once', () => {
    const tables = declarations(/CREATE TABLE\s+`([^`]+)`/g);
    expect(new Set(tables).size).toBe(tables.length);
    expect(new Set(tables)).toEqual(new Set(['users', 'drivers', 'offers', 'pricing_settings', 'ride_events', 'rides']));
  });
  it('creates each domain index once', () => {
    const indexes = declarations(/CREATE INDEX\s+`([^`]+)`/g);
    expect(new Set(indexes).size).toBe(indexes.length);
    expect(indexes).toHaveLength(7);
  });
  it('keeps the repair marker additive and avoids unsupported TEXT defaults', () => {
    expect(readFileSync(resolve(root, '0002_parched_millenium_guard.sql'), 'utf8')).toContain('SELECT 1;');
    expect(sql).not.toMatch(/DROP TABLE/i);
    expect(sql).not.toMatch(/text\s+NOT NULL\s+DEFAULT/i);
    expect(sql).toContain('DEFAULT 0');
  });
});
