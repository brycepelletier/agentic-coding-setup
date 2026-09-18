import { canonicalId } from './test-definitions.mjs';

export function expandLevels(value) {
  const levels = new Set();
  for (const part of String(value).split(',')) {
    const range = part.match(/^(?:L)?(\d+)-(?:L)?(\d+)$/i);
    if (range) {
      const start = Number(range[1]); const end = Number(range[2]);
      if (start > end) throw new Error(`Invalid reversed level range: ${part}`);
      for (let level = start; level <= end; level++) levels.add(`L${level}`);
      continue;
    }
    const legacy = canonicalId(part) ?? ({'1':'L1','2':'L2','3':'L5','4':'L7','4A':'L9','5':'L10','6':'L11','7':'L12','8':'L13'}[part.toUpperCase()]);
    if (!legacy) throw new Error(`Unknown qualification level: ${part}`);
    levels.add(legacy);
  }
  return levels;
}
