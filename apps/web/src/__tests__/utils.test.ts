import '@testing-library/jest-dom';
import { formatCents, formatBytes, formatDate, formatDateTime, cn } from '@/lib/utils';

describe('cn', () => {
  it('merges class names', () => {
    expect(cn('px-4', 'py-2')).toBe('px-4 py-2');
    expect(cn('px-4', false && 'hidden')).toBe('px-4');
  });
});

describe('formatCents', () => {
  it('formats cents as dollars', () => {
    expect(formatCents(0)).toBe('$0.00');
    expect(formatCents(100)).toBe('$1.00');
    expect(formatCents(1050)).toBe('$10.50');
    expect(formatCents(-500)).toBe('-$5.00');
  });
});

describe('formatBytes', () => {
  it('formats bytes to human-readable', () => {
    expect(formatBytes(500)).toBe('500.0 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(1048576)).toBe('1.0 MB');
    expect(formatBytes(1073741824)).toBe('1.0 GB');
  });
});

describe('formatDate', () => {
  it('formats a date string', () => {
    const result = formatDate('2026-07-01T00:00:00Z');
    expect(result).toContain('Jul');
    expect(result).toContain('1');
    expect(result).toContain('2026');
  });
});

describe('formatDateTime', () => {
  it('formats date and time', () => {
    const result = formatDateTime('2026-07-01T14:30:00Z');
    expect(result).toContain('Jul');
    expect(result).toContain('1');
    expect(result).toContain('2026');
    expect(result.length).toBeGreaterThan(10);
  });
});
