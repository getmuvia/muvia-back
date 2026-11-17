import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { UserRole } from '../../common/enums/user-role.enum';
import { Product } from '../products/entities/product.entity';
import { AssetType } from '../products/enums/asset-type.enum';
import { MarketsService } from '../markets/markets.service';
import { Quotation } from './entities/quotation.entity';
import { CreateQuotationDto } from './dto/create-quotation.dto';
import { RespondQuotationDto } from './dto/respond-quotation.dto';
import { QuotationFilterDto } from './dto/quotation-filter.dto';
import { QuotationStatus } from './quotation.constants';
import {
  requireQuotationDimensions,
  sameQuotationDimensions,
} from './quotation-dimensions';

@Injectable()
export class QuotationsService {
  constructor(
    @InjectRepository(Quotation)
    private readonly quotations: Repository<Quotation>,
    @InjectRepository(Product) private readonly products: Repository<Product>,
    private readonly markets: MarketsService,
  ) {}

  async create(
    user: AuthenticatedUser,
    dto: CreateQuotationDto,
  ): Promise<Quotation> {
    const existing = await this.findRetry(user.id, dto);
    if (existing) return existing;
    const snapshot = await this.productSnapshot(user.id, dto);
    const quotation = this.quotations.create({
      ...snapshot,
      requestId: dto.requestId,
      customerId: user.id,
      customerEmail: user.email,
      requestedDimensions: requireQuotationDimensions(dto.dimensions),
      notes: dto.notes?.trim() ?? '',
    });
    try {
      return await this.quotations.save(quotation);
    } catch (error: unknown) {
      // A concurrent retry uses the same unique request identifier.
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === '23505'
      ) {
        const retry = await this.findRetry(user.id, dto);
        if (retry) return retry;
      }
      throw error;
    }
  }

  async list(user: AuthenticatedUser, filter: QuotationFilterDto) {
    if (filter.view === 'received' && user.role !== UserRole.VENDOR)
      throw new ForbiddenException();
    const where =
      filter.view === 'received'
        ? { sellerId: user.id }
        : { customerId: user.id };
    const [data, total] = await this.quotations.findAndCount({
      where,
      order: { createdAt: 'DESC', id: 'DESC' },
      skip: (filter.page - 1) * filter.limit,
      take: filter.limit,
    });
    return {
      data,
      total,
      page: filter.page,
      limit: filter.limit,
      totalPages: Math.ceil(total / filter.limit),
    };
  }

  async findOne(id: string, userId: string): Promise<Quotation> {
    const quotation = await this.quotations.findOne({
      where: [
        { id, customerId: userId },
        { id, sellerId: userId },
      ],
    });
    if (!quotation) throw new NotFoundException('Quotation not found');
    return quotation;
  }

  async markRead(
    id: string,
    userId: string,
    respondedAt: string | null = null,
  ): Promise<void> {
    const quotation = await this.findOne(id, userId);
    if (quotation.sellerId === userId) {
      await this.quotations.update(id, { sellerViewedAt: new Date() });
      return;
    }
    // A stale pending page must not mark a newly arrived response as read.
    if (
      !quotation.respondedAt ||
      quotation.respondedAt.toISOString() !== respondedAt
    )
      return;
    await this.quotations.update(
      { id, respondedAt: quotation.respondedAt },
      { customerViewedAt: quotation.respondedAt },
    );
  }

  async respond(
    id: string,
    sellerId: string,
    dto: RespondQuotationDto,
  ): Promise<Quotation> {
    const quotation = await this.findOne(id, sellerId);
    if (quotation.sellerId !== sellerId) throw new ForbiddenException();
    const message = dto.message.trim();
    if (!message)
      throw new BadRequestException('A response message is required');
    const quoted = dto.status === QuotationStatus.QUOTED;
    if (quoted && dto.leadTimeMinDays! > dto.leadTimeMaxDays!)
      throw new BadRequestException(
        'Minimum production time cannot exceed maximum',
      );
    const result = await this.quotations.update(
      { id, sellerId, status: QuotationStatus.PENDING },
      {
        status: dto.status,
        quotedPrice: quoted ? dto.price!.toFixed(2) : null,
        leadTimeMinDays: quoted ? dto.leadTimeMinDays! : null,
        leadTimeMaxDays: quoted ? dto.leadTimeMaxDays! : null,
        responseMessage: message,
        respondedAt: new Date(),
      },
    );
    if (!result.affected)
      throw new ConflictException('This request has already been answered');
    return this.findOne(id, sellerId);
  }

  private async findRetry(
    customerId: string,
    dto: CreateQuotationDto,
  ): Promise<Quotation | null> {
    const quotation = await this.quotations.findOneBy({
      customerId,
      requestId: dto.requestId,
    });
    if (
      quotation &&
      (quotation.productId !== dto.productId ||
        quotation.marketCode !== dto.marketCode ||
        quotation.notes !== (dto.notes?.trim() ?? '') ||
        !sameQuotationDimensions(
          quotation.requestedDimensions,
          requireQuotationDimensions(dto.dimensions),
        ))
    ) {
      throw new ConflictException(
        'The request identifier was already used for different details',
      );
    }
    return quotation;
  }

  private async productSnapshot(customerId: string, dto: CreateQuotationDto) {
    await this.markets.requireActive(dto.marketCode);
    const product = await this.products.findOne({
      where: { id: dto.productId },
      relations: {
        listings: true,
        assets: true,
        seller: { vendorProfile: true },
      },
    });
    if (!product) throw new NotFoundException('Product not found');
    if (product.sellerId === customerId)
      throw new BadRequestException(
        'You cannot request a quotation for your own product',
      );
    if (!product.acceptsCustomDimensions)
      throw new ConflictException(
        'This product does not accept custom dimensions',
      );
    const listing = product.listings.find(
      (item) => item.marketCode === dto.marketCode && item.isActive,
    );
    if (!listing)
      throw new ConflictException(
        'This product is unavailable in the selected market',
      );
    const publishedDimensions = requireQuotationDimensions(
      product.specifications?.dimensions,
    );
    const requested = requireQuotationDimensions(dto.dimensions);
    if (requested.unit !== publishedDimensions.unit)
      throw new BadRequestException('Use the published dimension unit');
    const image =
      product.assets.find(
        (asset) => asset.type === AssetType.IMAGE && asset.isPrimary,
      ) ?? product.assets.find((asset) => asset.type === AssetType.IMAGE);
    return {
      productId: product.id,
      sellerId: product.sellerId,
      sellerName: product.seller?.vendorProfile?.businessName ?? null,
      productTitle: product.title,
      productImageUrl: image?.url ?? null,
      marketCode: listing.marketCode,
      currencyCode: listing.currencyCode,
      publishedPrice: Number(listing.price).toFixed(2),
      publishedDimensions,
    };
  }
}
