import { CategoryTaxonomyService } from './category-taxonomy.service';
import { Test, TestingModule } from '@nestjs/testing';
import { EntityManager, Repository } from 'typeorm';
import { Category } from './entities/category.entity';
import { CategoriesService } from './categories.service';

describe('CategoriesService', () => {
  let service: CategoriesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CategoriesService],
    })
      .useMocker(() => ({}))
      .compile();

    service = module.get<CategoriesService>(CategoriesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});

describe('CategoriesService embedding invalidation', () => {
  let service: CategoriesService;
  const findOne = jest.fn();
  const save = jest.fn();
  const remove = jest.fn();
  const query = jest.fn();
  const categoryId = 'category-id';

  beforeEach(() => {
    jest.resetAllMocks();
    findOne.mockResolvedValue({
      id: categoryId,
      name: 'Desk',
      code: 'DESK',
    } as Category);
    const manager = {
      getRepository: () => ({ findOne, save, remove }),
      query,
    } as unknown as EntityManager;
    service = new CategoriesService({
      findOne,
      manager: {
        transaction: (work: (value: EntityManager) => Promise<unknown>) =>
          work(manager),
      },
    } as unknown as Repository<Category>);
  });

  it.each([{ name: 'Office desk' }, { code: 'OFFICE_DESK' }])(
    'invalidates product revisions when semantic category content changes: %j',
    async (change) => {
      await service.update(categoryId, change);
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('search_revision = search_revision + 1'),
        [categoryId],
      );
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('embedding_target_id = NULL'),
        [categoryId],
      );
      expect(findOne).toHaveBeenCalledWith({
        where: { id: categoryId },
        lock: { mode: 'pessimistic_write' },
      });
    },
  );

  it('does not invalidate products for an unchanged category name', async () => {
    await service.update(categoryId, { name: 'Desk' });
    expect(query).not.toHaveBeenCalled();
  });

  it('invalidates products before removing their category', async () => {
    await service.remove(categoryId);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('category_id = NULL'),
      [categoryId],
    );
    expect(remove).toHaveBeenCalledTimes(1);
    expect(query.mock.invocationCallOrder[0]).toBeLessThan(
      remove.mock.invocationCallOrder[0],
    );
  });
});

describe('Search catalog vocabulary cache', () => {
  it('shares one catalog read across concurrent searches and different locales', async () => {
    const find = jest.fn().mockResolvedValue([
      {
        code: 'DESK',
        name: 'Escritorio',
        translations: [{ locale: 'en', name: 'Desk' }],
        aliases: [
          { locale: 'es', alias: 'escritorio' },
          { locale: 'en', alias: 'desk' },
        ],
      },
    ]);
    const service = new CategoryTaxonomyService({
      find,
    } as unknown as Repository<Category>);
    const [spanish, english] = await Promise.all([
      service.getSearchCategories('es-BO'),
      service.getSearchCategories('en'),
    ]);
    expect(find).toHaveBeenCalledTimes(1);
    expect(spanish[0].label).toBe('Escritorio');
    expect(english[0].label).toBe('Desk');
    await service.getSearchCategories('es-PE');
    expect(find).toHaveBeenCalledTimes(1);
  });
  it('retries the database after a failed catalog read', async () => {
    const find = jest
      .fn()
      .mockRejectedValueOnce(new Error('temporarily unavailable'))
      .mockResolvedValue([]);
    const service = new CategoryTaxonomyService({
      find,
    } as unknown as Repository<Category>);
    await expect(service.getSearchCategories('es-BO')).rejects.toThrow();
    expect(await service.getSearchCategories('es-BO')).toEqual([]);
    expect(find).toHaveBeenCalledTimes(2);
  });
});
