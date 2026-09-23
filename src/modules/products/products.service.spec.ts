import { NotFoundException } from '@nestjs/common';
import { EntityManager, Repository } from 'typeorm';
import { EmbeddingService } from '../ai/services/embedding/embedding.service';
import { Category } from '../categories/entities/category.entity';
import { Market } from '../markets/entities/market.entity';
import { MarketsService } from '../markets/markets.service';
import { VendorLocation } from '../users/entities/vendor-location.entity';
import { CreateProductDto } from './dto/create-product.dto';
import { ProductAsset } from './entities/product-asset.entity';
import { ProductListing } from './entities/product-listing.entity';
import { Product } from './entities/product.entity';
import { AssetType } from './enums/asset-type.enum';
import { ProductsService } from './products.service';

type RepositoryMock = {
  create: jest.Mock;
  save: jest.Mock;
  findOne: jest.Mock;
  find: jest.Mock;
  update: jest.Mock;
  delete: jest.Mock;
  existsBy: jest.Mock;
};

const createRepositoryMock = (): RepositoryMock => ({
  create: jest.fn((entity: unknown): unknown => entity),
  save: jest.fn((entity: unknown): Promise<unknown> => Promise.resolve(entity)),
  findOne: jest.fn(),
  find: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  existsBy: jest.fn(),
});

describe('ProductsService transactional writes', () => {
  const sellerId = 'seller-id';
  const productId = 'product-id';
  const locationId = 'location-id';

  let service: ProductsService;
  let productRepository: Repository<Product>;
  let standaloneAssetRepository: RepositoryMock;
  let transaction: jest.Mock;
  let productRepositoryInTransaction: RepositoryMock;
  let assetRepositoryInTransaction: RepositoryMock;
  let listingRepositoryInTransaction: RepositoryMock;
  let locationRepositoryInTransaction: RepositoryMock;
  let categoryRepositoryInTransaction: RepositoryMock;
  let marketRepositoryInTransaction: RepositoryMock;
  let embeddingService: { updateForProduct: jest.Mock };

  const product = {
    id: productId,
    sellerId,
    title: 'Desk',
    price: 120,
    stock: 4,
  } as Product;

  const createDto: CreateProductDto = {
    title: 'Desk',
    price: 120,
    stock: 4,
    assets: [
      {
        url: 'https://example.com/desk.webp',
        type: AssetType.IMAGE,
      },
    ],
  };

  beforeEach(() => {
    productRepositoryInTransaction = createRepositoryMock();
    assetRepositoryInTransaction = createRepositoryMock();
    listingRepositoryInTransaction = createRepositoryMock();
    locationRepositoryInTransaction = createRepositoryMock();
    categoryRepositoryInTransaction = createRepositoryMock();
    marketRepositoryInTransaction = createRepositoryMock();
    standaloneAssetRepository = createRepositoryMock();

    productRepositoryInTransaction.save.mockResolvedValue(product);
    productRepositoryInTransaction.findOne.mockResolvedValue(product);
    locationRepositoryInTransaction.findOne.mockResolvedValue({
      id: locationId,
      countryCode: 'bo',
    } as VendorLocation);
    marketRepositoryInTransaction.findOne.mockResolvedValue({
      code: 'BO',
      currencyCode: 'BOB',
      isActive: true,
    } as Market);
    listingRepositoryInTransaction.update.mockResolvedValue({ affected: 1 });
    assetRepositoryInTransaction.find.mockResolvedValue([]);
    assetRepositoryInTransaction.update.mockResolvedValue({ affected: 1 });
    assetRepositoryInTransaction.delete.mockResolvedValue({ affected: 1 });
    assetRepositoryInTransaction.existsBy.mockResolvedValue(true);

    const repositories = new Map<unknown, RepositoryMock>([
      [Product, productRepositoryInTransaction],
      [ProductAsset, assetRepositoryInTransaction],
      [ProductListing, listingRepositoryInTransaction],
      [VendorLocation, locationRepositoryInTransaction],
      [Category, categoryRepositoryInTransaction],
      [Market, marketRepositoryInTransaction],
    ]);
    const manager = {
      getRepository: jest.fn((entity) => repositories.get(entity)),
    } as unknown as EntityManager;

    transaction = jest.fn(
      (
        work: (transactionManager: EntityManager) => Promise<unknown>,
      ): Promise<unknown> => work(manager),
    );
    productRepository = {
      manager: { transaction },
    } as unknown as Repository<Product>;
    embeddingService = {
      updateForProduct: jest.fn().mockResolvedValue(undefined),
    };

    service = new ProductsService(
      productRepository,
      standaloneAssetRepository as unknown as Repository<ProductAsset>,
      embeddingService as unknown as EmbeddingService,
      {} as MarketsService,
    );
  });

  it('creates the product, listing and assets in one transaction', async () => {
    await expect(service.create(sellerId, createDto)).resolves.toBe(product);

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(productRepositoryInTransaction.save).toHaveBeenCalledTimes(1);
    expect(listingRepositoryInTransaction.save).toHaveBeenCalledTimes(1);
    expect(assetRepositoryInTransaction.save).toHaveBeenCalledTimes(1);
    expect(standaloneAssetRepository.save).not.toHaveBeenCalled();
    expect(embeddingService.updateForProduct).toHaveBeenCalledWith(productId);
  });

  it('does not schedule the embedding when a transactional create fails', async () => {
    assetRepositoryInTransaction.save.mockRejectedValue(
      new Error('asset write failed'),
    );

    await expect(service.create(sellerId, createDto)).rejects.toThrow(
      'asset write failed',
    );

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(productRepositoryInTransaction.save).toHaveBeenCalledTimes(1);
    expect(listingRepositoryInTransaction.save).toHaveBeenCalledTimes(1);
    expect(assetRepositoryInTransaction.save).toHaveBeenCalledTimes(1);
    expect(embeddingService.updateForProduct).not.toHaveBeenCalled();
  });

  it('does not schedule the embedding when a transactional update fails', async () => {
    productRepositoryInTransaction.findOne.mockResolvedValueOnce(product);
    assetRepositoryInTransaction.save.mockRejectedValue(
      new Error('asset update failed'),
    );

    await expect(
      service.update(productId, sellerId, {
        title: 'Updated desk',
        assets: [
          {
            url: 'https://example.com/updated-desk.webp',
            type: AssetType.IMAGE,
          },
        ],
      }),
    ).rejects.toThrow('asset update failed');

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(productRepositoryInTransaction.save).toHaveBeenCalledTimes(1);
    expect(assetRepositoryInTransaction.save).toHaveBeenCalledTimes(1);
    expect(embeddingService.updateForProduct).not.toHaveBeenCalled();
  });

  it('exposes a stable code when the requested product does not exist', async () => {
    productRepositoryInTransaction.findOne.mockResolvedValue(null);

    const error = await service
      .update(productId, sellerId, { title: 'Updated desk' })
      .catch((caughtError: unknown) => caughtError);

    expect(error).toBeInstanceOf(NotFoundException);
    expect((error as NotFoundException).getResponse()).toMatchObject({
      code: 'PRODUCT_NOT_FOUND',
    });
    expect(embeddingService.updateForProduct).not.toHaveBeenCalled();
  });

  it('changes the primary asset atomically', async () => {
    await service.setPrimaryAsset(productId, 'asset-id', sellerId);

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(assetRepositoryInTransaction.existsBy).toHaveBeenCalledWith({
      id: 'asset-id',
      productId,
    });
    expect(assetRepositoryInTransaction.update).toHaveBeenNthCalledWith(
      1,
      { productId },
      { isPrimary: false },
    );
    expect(assetRepositoryInTransaction.update).toHaveBeenNthCalledWith(
      2,
      { id: 'asset-id', productId },
      { isPrimary: true },
    );
    expect(standaloneAssetRepository.update).not.toHaveBeenCalled();
  });
});
