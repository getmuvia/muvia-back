import { Controller, Get, Headers, Query } from '@nestjs/common';
import { MarketsService } from './markets.service';
import { StorefrontContextDto } from './dto/storefront-context.dto';

@Controller('markets')
export class MarketsController {
  constructor(private readonly marketsService: MarketsService) {}

  @Get()
  findActive() {
    return this.marketsService.findActive();
  }

  @Get('context')
  context(
    @Query() dto: StorefrontContextDto,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    return this.marketsService.resolveContext(dto, headers);
  }

  @Get('bootstrap')
  bootstrap(
    @Query() dto: StorefrontContextDto,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    return this.marketsService.storefrontBootstrap(dto, headers);
  }
}
