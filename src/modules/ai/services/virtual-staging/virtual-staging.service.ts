import {
    Injectable,
    Inject,
    Logger,
    BadRequestException,
    HttpException,
    HttpStatus,
    NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { IVisionProvider, RoomAnalysisResult } from '../../interfaces/vision-provider.interface';
import { VISION_PROVIDER } from '../../interfaces/vision-provider.interface';
import type { IImageGenerator } from '../../interfaces/image-generator.interface';
import { IMAGE_GENERATOR } from '../../interfaces/image-generator.interface';
import type {
    VirtualStagingQuotaDto,
    VirtualStagingProductDto,
    VirtualStagingResponseDto,
    VirtualStagingRequestDto,
} from '../../dto/virtual-staging.dto';
import { buildStagingPrompt, STAGING_GENERATION_CONFIG } from '../../prompts';
import { User } from '../../../users/entities/user.entity';
import { Product } from '../../../products/entities/product.entity';
import { AssetType } from '../../../products/enums/asset-type.enum';

const DAILY_VIRTUAL_STAGING_LIMIT = 10;
const QUOTA_TIME_ZONE = 'America/La_Paz';

interface QuotaRow {
    remaining: number | string;
}

/**
 * Virtual Staging Service
 *
 * Orchestrates the complete virtual staging workflow:
 * 1. Room Analysis - Uses vision AI to analyze the room image
 * 2. Product Resolution - Loads the catalog product selected by the user
 * 3. Image Generation - Creates staged room with products
 *
 * Uses Ports & Adapters pattern for AI provider flexibility.
 */
@Injectable()
export class VirtualStagingService {
    private readonly logger = new Logger(VirtualStagingService.name);

    constructor(
        @Inject(VISION_PROVIDER)
        private readonly visionProvider: IVisionProvider,

        @Inject(IMAGE_GENERATOR)
        private readonly imageGenerator: IImageGenerator,

        @InjectRepository(User)
        private readonly userRepository: Repository<User>,

        @InjectRepository(Product)
        private readonly productRepository: Repository<Product>,
    ) { }

    /**
     * Returns the effective quota for the current Bolivia calendar day.
     * An expired stored quota is exposed as a fresh daily allowance without a cron job.
     */
    async getQuota(userId: string): Promise<VirtualStagingQuotaDto> {
        const rows = await this.userRepository.query<QuotaRow[]>(
            `
                SELECT CASE
                    WHEN "virtualStagingQuotaDay" =
                        (CURRENT_TIMESTAMP AT TIME ZONE $1)::date
                    THEN "virtualStagingQuotaRemaining"
                    ELSE $2
                END AS "remaining"
                FROM "users"
                WHERE "id" = $3
            `,
            [QUOTA_TIME_ZONE, DAILY_VIRTUAL_STAGING_LIMIT, userId],
        );

        if (!rows[0]) {
            throw new NotFoundException('User not found');
        }

        return this.buildQuota(rows[0].remaining);
    }

    /**
     * Generates a staged room image with the catalog product selected by the user.
     *
     * @param dto - Request with image source and preferences
     * @returns Staged image URL, room analysis, and selected product
     * @throws BadRequestException if no image source is provided
     */
    async generateStagedRoom(
        dto: VirtualStagingRequestDto,
        userId: string,
    ): Promise<VirtualStagingResponseDto> {
        const startTime = Date.now();

        this.validateImageSource(dto);
        const selectedProduct = await this.resolveSelectedProduct(dto.productId);
        const quota = await this.reserveQuota(userId);

        try {
            this.logger.log(`Starting virtual staging...`);

            // 1. Analyze the room while preserving the user's product choice
            const analysis = await this.analyzeRoomWithUrlFallback(dto);
            if (dto.preferredStyle) analysis.style = dto.preferredStyle;

            // 2. Generate the staged image using only the explicitly selected product
            const prompt = this.buildPromptForStaging(analysis, selectedProduct);
            const generatedImage = await this.generateImageWithUrlFallback(dto, prompt, selectedProduct);

            const processingTimeMs = Date.now() - startTime;
            this.logger.log(`Virtual staging completed in ${processingTimeMs}ms`);

            return {
                analysis,
                selectedProduct,
                stagedImageUrl: generatedImage.imageUrl,
                quota,
                metadata: { processingTimeMs, productsFound: 1 },
            };
        } catch (error) {
            await this.refundQuotaSafely(userId);
            throw error;
        }
    }

    /**
     * @deprecated Use generateStagedRoom instead. Kept for backward compatibility.
     */
    async stageRoom(
        dto: VirtualStagingRequestDto,
        userId: string,
    ): Promise<VirtualStagingResponseDto> {
        return this.generateStagedRoom(dto, userId);
    }

    /**
     * Atomically reserves one generation. The first reservation on a new day
     * resets the allowance and immediately consumes one use.
     */
    private async reserveQuota(userId: string): Promise<VirtualStagingQuotaDto> {
        const rows = await this.userRepository.query<QuotaRow[]>(
            `
                UPDATE "users"
                SET
                    "virtualStagingQuotaRemaining" = CASE
                        WHEN "virtualStagingQuotaDay" IS DISTINCT FROM
                            (CURRENT_TIMESTAMP AT TIME ZONE $1)::date
                        THEN $2 - 1
                        ELSE "virtualStagingQuotaRemaining" - 1
                    END,
                    "virtualStagingQuotaDay" =
                        (CURRENT_TIMESTAMP AT TIME ZONE $1)::date
                WHERE "id" = $3
                  AND (
                      "virtualStagingQuotaDay" IS DISTINCT FROM
                          (CURRENT_TIMESTAMP AT TIME ZONE $1)::date
                      OR "virtualStagingQuotaRemaining" > 0
                  )
                RETURNING "virtualStagingQuotaRemaining" AS "remaining"
            `,
            [QUOTA_TIME_ZONE, DAILY_VIRTUAL_STAGING_LIMIT, userId],
        );

        if (!rows[0]) {
            throw new HttpException(
                'Has alcanzado el límite de 10 generaciones de hoy. Inténtalo nuevamente mañana.',
                HttpStatus.TOO_MANY_REQUESTS,
            );
        }

        return this.buildQuota(rows[0].remaining);
    }

    /** Returns a reserved generation when the AI workflow does not complete. */
    private async refundQuotaSafely(userId: string): Promise<void> {
        try {
            await this.userRepository.query(
                `
                    UPDATE "users"
                    SET "virtualStagingQuotaRemaining" = LEAST(
                        $2,
                        "virtualStagingQuotaRemaining" + 1
                    )
                    WHERE "id" = $3
                      AND "virtualStagingQuotaDay" =
                          (CURRENT_TIMESTAMP AT TIME ZONE $1)::date
                `,
                [QUOTA_TIME_ZONE, DAILY_VIRTUAL_STAGING_LIMIT, userId],
            );
        } catch (error) {
            this.logger.error(
                `Could not refund virtual staging quota for user ${userId}`,
                error instanceof Error ? error.stack : undefined,
            );
        }
    }

    private buildQuota(remaining: number | string): VirtualStagingQuotaDto {
        return {
            limit: DAILY_VIRTUAL_STAGING_LIMIT,
            remaining: Number(remaining),
        };
    }

    /**
     * Validates that at least one image source is provided.
     */
    private validateImageSource(dto: VirtualStagingRequestDto): void {
        const gcsKey = dto.gcsStorageKey ?? dto.imageKey;
        const externalUrl = dto.externalImageUrl ?? dto.imageUrl;

        if (!gcsKey && !externalUrl) {
            throw new BadRequestException('Either gcsStorageKey/imageKey or externalImageUrl/imageUrl must be provided');
        }
    }

    /**
     * Gets the effective GCS key from DTO (supports legacy field names).
     */
    private getGcsKey(dto: VirtualStagingRequestDto): string | undefined {
        return dto.gcsStorageKey ?? dto.imageKey;
    }

    /**
     * Gets the effective external URL from DTO (supports legacy field names).
     */
    private getExternalUrl(dto: VirtualStagingRequestDto): string | undefined {
        return dto.externalImageUrl ?? dto.imageUrl;
    }

    /** Loads the selected product and resolves the image used as the AI reference. */
    private async resolveSelectedProduct(productId: string): Promise<VirtualStagingProductDto> {
        const product = await this.productRepository.findOne({
            where: { id: productId },
            relations: ['assets'],
        });

        if (!product) {
            throw new NotFoundException('El producto seleccionado ya no está disponible.');
        }

        const imageAssets = (product.assets ?? []).filter(
            asset => asset.type === AssetType.IMAGE && this.isSupportedReferenceUrl(asset.url),
        );
        const referenceImage = imageAssets.find(asset => asset.isPrimary) ?? imageAssets[0];

        if (!referenceImage) {
            throw new BadRequestException('El producto seleccionado no tiene una imagen disponible para la generación.');
        }

        return {
            id: product.id,
            title: product.title,
            description: product.description,
            price: Number(product.price),
            imageUrl: referenceImage.url,
        };
    }

    private isSupportedReferenceUrl(url: string): boolean {
        return url.startsWith('http://') || url.startsWith('https://');
    }

    /**
     * Builds the staging prompt using the centralized prompt builder.
     */
    private buildPromptForStaging(
        analysis: RoomAnalysisResult,
        product: VirtualStagingProductDto,
    ): string {
        return buildStagingPrompt({
            analysis,
            products: [{ title: product.title, index: 0 }],
            hasReferenceImages: true,
        });
    }

    /**
     * Analyzes the room image, falling back to URL if GCS key fails.
     */
    private async analyzeRoomWithUrlFallback(dto: VirtualStagingRequestDto): Promise<RoomAnalysisResult> {
        const gcsKey = this.getGcsKey(dto);
        const externalUrl = this.getExternalUrl(dto);

        if (gcsKey) {
            try {
                this.logger.debug(`Analyzing room via GCS key: ${gcsKey}`);
                return await this.visionProvider.analyzeRoom({ key: gcsKey });
            } catch (error) {
                this.logger.warn(`GCS key analysis failed: ${error.message}`);
                if (externalUrl) {
                    this.logger.debug(`Falling back to URL analysis`);
                    return await this.visionProvider.analyzeRoom({ url: externalUrl });
                }
                throw error;
            }
        }
        return await this.visionProvider.analyzeRoom({ url: externalUrl });
    }

    /**
     * Generates staged image, with URL fallback if GCS key fails.
     */
    private async generateImageWithUrlFallback(
        dto: VirtualStagingRequestDto,
        prompt: string,
        product: VirtualStagingProductDto,
    ) {
        const gcsKey = this.getGcsKey(dto);
        const externalUrl = this.getExternalUrl(dto);

        const baseRequest = {
            prompt,
            style: 'photorealistic' as const,
            negativePrompt: STAGING_GENERATION_CONFIG.defaultNegativePrompt,
            referenceImages: [product.imageUrl],
        };

        if (gcsKey) {
            try {
                return await this.imageGenerator.generate({ ...baseRequest, imageSource: { key: gcsKey } });
            } catch (error) {
                this.logger.warn(`GCS key generation failed, falling back to URL...`);
            }
        }
        return await this.imageGenerator.generate({ ...baseRequest, imageSource: { url: externalUrl } });
    }

}
