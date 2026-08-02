import { describe, expect, it } from 'vitest';
import { collectionKeys } from '../../../../../src/renderer/src/api/collectionKeys';

describe('collectionKeys Factory', () => {
  it('should generate the base all key', () => {
    expect(collectionKeys.all).toEqual(['collections']);
  });

  it('should generate tree keys', () => {
    expect(collectionKeys.tree()).toEqual(['collections', 'tree']);
  });

  it('should generate detail keys', () => {
    expect(collectionKeys.detail(42)).toEqual(['collections', 'detail', 42]);
  });

  it('should generate children keys', () => {
    expect(collectionKeys.children(42)).toEqual(['collections', 'children', 42]);
    expect(collectionKeys.children(null)).toEqual(['collections', 'children', null]);
  });

  it('should generate entries keys', () => {
    expect(collectionKeys.entries(42)).toEqual(['collections', 'entries', 42]);
  });

  it('should generate sidebar keys', () => {
    expect(collectionKeys.sidebar()).toEqual(['collections', 'sidebar']);
  });

  it('should generate breadcrumbs keys', () => {
    expect(collectionKeys.breadcrumbs(10)).toEqual(['collections', 'breadcrumbs', 10]);
  });
});
