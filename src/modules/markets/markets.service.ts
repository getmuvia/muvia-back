import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Market } from './entities/market.entity';
import { StorefrontContextDto } from './dto/storefront-context.dto';

type CountryHeaders = Record<string, string | string[] | undefined>;

@Injectable()
export class MarketsService {
  constructor(
    @InjectRepository(Market)
    private readonly marketRepository: Repository<Market>,
  ) {}

  findActive(): Promise<Market[]> {
    return this.marketRepository.find({
      where: { isActive: true },
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
  }

  async requireActive(code: string): Promise<Market> {
    const market = await this.marketRepository.findOne({
      where: { code: code.toUpperCase(), isActive: true },
    });
    if (!market) throw new NotFoundException(`Market ${code} is not available`);
    return market;
  }

  async resolveContext(dto: StorefrontContextDto, headers: CountryHeaders) {
    const activeMarkets = await this.findActive();
    return this.buildContext(activeMarkets, dto, headers);
  }

  async storefrontBootstrap(dto: StorefrontContextDto, headers: CountryHeaders) {
    const markets = await this.findActive();
    return {
      markets,
      context: this.buildContext(markets, dto, headers),
    };
  }

  private buildContext(
    activeMarkets: Market[],
    dto: StorefrontContextDto,
    headers: CountryHeaders,
  ) {
    if (!activeMarkets.length) throw new NotFoundException('No storefront markets are available');

    const explicitCode = dto.countryCode?.toUpperCase();
    const edgeCode = this.readEdgeCountry(headers);
    const detectedCode = explicitCode ?? edgeCode
      ?? activeMarkets.find(market => dto.timeZone && market.timeZones.includes(dto.timeZone))?.code;
    const selectedMarket = activeMarkets.find(market => market.code === detectedCode)
      ?? activeMarkets.find(market => market.isDefault)
      ?? activeMarkets[0];
    const source = explicitCode && selectedMarket.code === explicitCode
      ? 'selection'
      : edgeCode && selectedMarket.code === edgeCode
        ? 'edge'
        : dto.timeZone && selectedMarket.timeZones.includes(dto.timeZone)
          ? 'timezone'
          : 'default';

    return {
      market: selectedMarket,
      locale: this.resolveLocale(selectedMarket, dto.locale),
      detectedCountryCode: detectedCode ?? null,
      detectedMarketAvailable: detectedCode ? activeMarkets.some(market => market.code === detectedCode) : false,
      source,
    };
  }

  private resolveLocale(market: Market, requested?: string): string {
    if (!requested) return market.defaultLocale;
    const normalized = requested.replace('_', '-');
    const exact = market.supportedLocales.find(locale => locale.toLowerCase() === normalized.toLowerCase());
    if (exact) return exact;
    const language = normalized.split('-')[0].toLowerCase();
    return market.supportedLocales.find(locale => locale.split('-')[0].toLowerCase() === language)
      ?? market.defaultLocale;
  }

  private readEdgeCountry(headers: CountryHeaders): string | undefined {
    // Only deployment infrastructure should set these headers. Do not use the
    // selected market as an authorization boundary.
    for (const name of ['cf-ipcountry', 'cloudfront-viewer-country', 'x-vercel-ip-country']) {
      const raw = headers[name];
      const value = Array.isArray(raw) ? raw[0] : raw;
      if (value && /^[A-Za-z]{2}$/.test(value)) return value.toUpperCase();
    }
    return undefined;
  }
}
