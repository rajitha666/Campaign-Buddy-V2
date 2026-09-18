import { describe, it, expect } from 'vitest';
import { resultText, scoreLabel, resultsCsv, absoluteUrl, toCsv } from './supervisorResults';

describe('toCsv', () => {
  it('quotes fields that contain commas, quotes or newlines', () => {
    expect(toCsv([['a', 'b,c', 'say "hi"', 'line\nbreak', null]])).toBe('a,"b,c","say ""hi""","line\nbreak",');
  });
});

const photo = (url, at = '2026-09-18T04:30:00.000Z') => ({ url, uploadedAt: at });

describe('resultText', () => {
  it('summarises a rating, feedback or photos', () => {
    expect(resultText({ taskType: 'range', rating: 4 })).toBe('4 / 5');
    expect(resultText({ taskType: 'feedback', feedback: 'Low stock' })).toBe('Low stock');
    expect(resultText({ taskType: 'photo', photos: [photo('/a.jpg'), photo('/b.jpg')] })).toBe('2 photos');
    expect(resultText({ taskType: 'photo', photos: [photo('/a.jpg')] })).toBe('1 photo');
  });

  it('is blank when nothing was answered', () => {
    expect(resultText({ taskType: 'range', rating: null })).toBe('');
  });
});

describe('scoreLabel', () => {
  it('formats an average out of 5, or a dash when there are no ratings', () => {
    expect(scoreLabel(4.25)).toBe('4.3 / 5');
    expect(scoreLabel(4)).toBe('4.0 / 5');
    expect(scoreLabel(null)).toBe('—');
  });
});

describe('absoluteUrl', () => {
  it('turns an /uploads path into a full link so it still works from an exported file', () => {
    expect(absoluteUrl('/uploads/visit-photos/a.jpg', 'https://office.example.lk')).toBe('https://office.example.lk/uploads/visit-photos/a.jpg');
    expect(absoluteUrl('https://cdn.example/x.jpg', 'https://office.example.lk')).toBe('https://cdn.example/x.jpg');
  });
});

describe('resultsCsv', () => {
  it('exports one line per answer with working photo links and upload times', () => {
    const rows = [
      { date: '2026-09-18T00:00:00.000Z', outletName: 'Keells', promoterName: 'Kasun', supervisorName: 'Dinesh', category: 'Sale', task: 'Pricing', taskType: 'range', rating: 4, feedback: null, photos: [] },
      { date: '2026-09-18T00:00:00.000Z', outletName: 'Keells', promoterName: null, supervisorName: 'Dinesh', category: 'Outlet PR', task: 'Display', taskType: 'photo', rating: null, feedback: null, photos: [photo('/uploads/visit-photos/a.jpg')] },
    ];
    const [header, first, second] = resultsCsv(rows, 'https://office.example.lk');
    expect(header).toEqual(['Date', 'Outlet', 'Promoter', 'Supervisor', 'Category', 'Task', 'Result', 'Photo links', 'Photo uploaded']);
    expect(first.slice(0, 8)).toEqual(['2026-09-18', 'Keells', 'Kasun', 'Dinesh', 'Sale', 'Pricing', '4 / 5', '']);
    expect(second[2]).toBe('');
    expect(second[7]).toBe('https://office.example.lk/uploads/visit-photos/a.jpg');
    expect(second[8]).toBe('2026-09-18T04:30:00.000Z');
  });
});
