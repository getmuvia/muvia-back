import { Category } from '../../../categories/entities/category.entity';
import { buildProductSearchDocument } from './product-search-document';

describe('buildProductSearchDocument', () => {
  it('includes the category, structured specifications and product copy', () => {
    const document = buildProductSearchDocument({
      title: ' Escritorio ejecutivo ',
      description: 'Mueble para oficina',
      category: { name: 'Escritorio', code: 'DESK' } as Category,
      specifications: {
        material: 'Melamina',
        dimensions: { width: 120, unit: 'cm' },
      },
      keywords: ['oficina', 'almacenamiento'],
    });
    expect(document).toContain('Title: Escritorio ejecutivo');
    expect(document).toContain('Category: Escritorio DESK');
    expect(document).toContain('material: Melamina');
    expect(document).toContain('dimensions.width: 120');
    expect(document).toContain('Keywords: oficina, almacenamiento');
  });

  it('uses stable object ordering and omits empty fields', () => {
    expect(buildProductSearchDocument({ specifications: { b: 2, a: 1 } })).toBe(
      buildProductSearchDocument({ specifications: { a: 1, b: 2 } }),
    );
    expect(
      buildProductSearchDocument({ title: ' ', specifications: null }),
    ).toBe('');
  });
});
