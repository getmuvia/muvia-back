import { ValidationPipe } from '@nestjs/common';
import { CreateProductDto } from './create-product.dto';
import { UpdateProductDto } from './update-product.dto';
import { ProductFilterDto } from './product-filter.dto';
import { HybridSearchDto } from '../../search/dto/hybrid-search.dto';
import { ProductCondition } from '../enums/product-condition.enum';

describe('Product condition API contract', () => {
  const pipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  });

  it('defaults an omitted creation condition to NEW', async () => {
    const dto = (await pipe.transform(
      { title: 'Desk', price: 100 },
      {
        type: 'body',
        metatype: CreateProductDto,
      },
    )) as CreateProductDto;
    expect(dto.condition).toBe(ProductCondition.NEW);
  });

  it.each([ProductCondition.NEW, ProductCondition.USED])(
    'accepts %s on creation',
    async (condition) => {
      const dto = (await pipe.transform(
        { title: 'Desk', price: 100, condition },
        {
          type: 'body',
          metatype: CreateProductDto,
        },
      )) as CreateProductDto;
      expect(dto.condition).toBe(condition);
    },
  );

  it('does not inherit the creation default during PATCH', async () => {
    const dto = (await pipe.transform(
      { price: 120 },
      {
        type: 'body',
        metatype: UpdateProductDto,
      },
    )) as UpdateProductDto;
    expect(dto.condition).toBeUndefined();
  });

  it.each([null, '', 'SEMINUEVO', 'used'])(
    'rejects an explicit invalid condition: %j',
    async (condition) => {
      await expect(
        pipe.transform(
          { title: 'Desk', price: 100, condition },
          {
            type: 'body',
            metatype: CreateProductDto,
          },
        ),
      ).rejects.toMatchObject({ status: 400 });
      await expect(
        pipe.transform(
          { condition },
          {
            type: 'body',
            metatype: UpdateProductDto,
          },
        ),
      ).rejects.toMatchObject({ status: 400 });
    },
  );

  it('validates the same condition filter in catalog and hybrid search requests', async () => {
    await expect(
      pipe.transform(
        { condition: 'USED' },
        {
          type: 'query',
          metatype: ProductFilterDto,
        },
      ),
    ).resolves.toMatchObject({ condition: ProductCondition.USED });
    await expect(
      pipe.transform(
        { query: 'silla', condition: 'USED' },
        {
          type: 'body',
          metatype: HybridSearchDto,
        },
      ),
    ).resolves.toMatchObject({ condition: ProductCondition.USED });
    await expect(
      pipe.transform(
        { query: 'silla', condition: 'SEMINUEVO' },
        {
          type: 'body',
          metatype: HybridSearchDto,
        },
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
});
