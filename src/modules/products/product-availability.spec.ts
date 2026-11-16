import { ValidationPipe } from '@nestjs/common';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductAvailabilityMode as Mode } from './enums/product-availability.enum';
import { resolveProductAvailability } from './product-availability';

describe('Product availability contract', () => {
  const pipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  const madeToOrder = {
    availabilityMode: Mode.MADE_TO_ORDER,
    leadTimeMinDays: 10,
    leadTimeMaxDays: 15,
    acceptsCustomDimensions: true,
  };

  it('keeps zero-stock legacy products in stock mode', () => {
    expect(resolveProductAvailability({})).toEqual({
      availabilityMode: Mode.IN_STOCK,
      leadTimeMinDays: null,
      leadTimeMaxDays: null,
      acceptsCustomDimensions: false,
    });
  });
  it('preserves made-to-order settings during unrelated PATCH requests', () => {
    expect(resolveProductAvailability({}, madeToOrder)).toEqual(madeToOrder);
  });
  it('clears production days when returning to stock without changing customization', () => {
    expect(
      resolveProductAvailability(
        { availabilityMode: Mode.IN_STOCK },
        madeToOrder,
      ),
    ).toEqual({
      ...madeToOrder,
      availabilityMode: Mode.IN_STOCK,
      leadTimeMinDays: null,
      leadTimeMaxDays: null,
    });
  });
  it('validates a partial range against the persisted range', () => {
    expect(() =>
      resolveProductAvailability({ leadTimeMinDays: 20 }, madeToOrder),
    ).toThrow();
    expect(
      resolveProductAvailability({ leadTimeMaxDays: 20 }, madeToOrder)
        .leadTimeMaxDays,
    ).toBe(20);
  });
  it.each([
    {},
    { leadTimeMinDays: 0, leadTimeMaxDays: 1 },
    { leadTimeMinDays: 2, leadTimeMaxDays: 1 },
    { leadTimeMinDays: 1.5, leadTimeMaxDays: 2 },
    { leadTimeMinDays: null, leadTimeMaxDays: 3 },
  ])('rejects invalid production ranges: %j', (range) => {
    expect(() =>
      resolveProductAvailability({
        availabilityMode: Mode.MADE_TO_ORDER,
        ...range,
      }),
    ).toThrow();
  });
  it.each([
    { availabilityMode: 'OTHER' },
    { availabilityMode: null },
    { acceptsCustomDimensions: 'false' },
    { acceptsCustomDimensions: null },
    { leadTimeMinDays: -1 },
    { leadTimeMaxDays: 1.5 },
    { stock: 1.5 },
  ])('rejects invalid API input: %j', async (input) => {
    await expect(
      pipe.transform(
        { title: 'Desk', price: 100, ...input },
        { type: 'body', metatype: CreateProductDto },
      ),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      pipe.transform(input, { type: 'body', metatype: UpdateProductDto }),
    ).rejects.toMatchObject({ status: 400 });
  });
  it('does not introduce defaults into a PATCH DTO', async () => {
    const dto = (await pipe.transform(
      { price: 120 },
      { type: 'body', metatype: UpdateProductDto },
    )) as UpdateProductDto;
    expect(dto.availabilityMode).toBeUndefined();
    expect(dto.acceptsCustomDimensions).toBeUndefined();
  });
});
