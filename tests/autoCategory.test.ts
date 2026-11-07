import { describe, expect, it } from 'vitest';
import { colorFamily, keywordCategory, nameWords, sharedWordCategories } from '../src/core/autoCategory';

describe('auto categories', () => {
  it('reads item types from file names, last word first', () => {
    expect(keywordCategory('evidence_bag.png')).toBe('Containers');
    expect(keywordCategory('detective_hat.png')).toBe('Armor & clothing');
    expect(keywordCategory('brass_key.png')).toBe('Keys & locks');
    expect(keywordCategory('IronSword02.png')).toBe('Weapons');
    expect(keywordCategory('health_potions.png')).toBe('Potions & magic');
    expect(keywordCategory('zzz_qqq.png')).toBeNull();
    expect(nameWords('IronSword-02.png')).toEqual(['iron', 'sword']);
  });
  it('groups names that share a word', () => {
    const names = ['evidence_bag', 'evidence_box', 'evidence_tray', 'case_folder', 'case_report', 'case_trophy', 'pearl_necklace'];
    expect(sharedWordCategories(names)).toEqual(['Evidence', 'Evidence', 'Evidence', 'Case', 'Case', 'Case', null]);
  });
  it('names colour families', () => {
    expect(colorFamily(0, 0.8, 0.5)).toBe('Red');
    expect(colorFamily(220, 0.7, 0.5)).toBe('Blue');
    expect(colorFamily(0, 0.05, 0.9)).toBe('White & light');
    expect(colorFamily(50, 0.8, 0.5)).toBe('Yellow & gold');
  });
});
