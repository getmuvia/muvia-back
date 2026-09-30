import type { Product } from '../../../products/entities/product.entity';

function field(label: string, value?: string | null): string | undefined {
  const text = value?.trim();
  return text ? `${label}: ${text}` : undefined;
}

function flatten(value: unknown, path = ''): string[] {
  if (value === undefined || value === null || value === '') return [];
  if (Array.isArray(value)) return value.flatMap((item) => flatten(item, path));
  if (typeof value === 'object') {
    return Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right, 'en'))
      .flatMap(([key, nested]) =>
        flatten(nested, path ? `${path}.${key}` : key),
      );
  }
  if (
    typeof value !== 'string' &&
    typeof value !== 'number' &&
    typeof value !== 'boolean' &&
    typeof value !== 'bigint'
  )
    return [];
  return [`${path ? `${path}: ` : ''}${String(value)}`];
}

/** Stable ordering makes equivalent JSON objects produce the same document. */
export function buildProductSearchDocument(product: Partial<Product>): string {
  return [
    field('Title', product.title),
    field(
      'Category',
      product.category
        ? [product.category.name, product.category.code]
            .filter(Boolean)
            .join(' ')
        : undefined,
    ),
    field('Specifications', flatten(product.specifications).join('; ')),
    field('Keywords', product.keywords?.join(', ')),
    field('Description', product.description),
  ]
    .filter((part): part is string => Boolean(part))
    .join('. ');
}
