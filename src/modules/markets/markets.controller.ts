import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { UpdateExchangeRateDto } from './dto/update-exchange-rate.dto';
import { MarketsService } from './markets.service';
import { StorefrontContextDto } from './dto/storefront-context.dto';

@Controller('markets')
export class MarketsController {
  constructor(private readonly marketsService: MarketsService) {}

  @Patch(':code/exchange-rates')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  updateExchangeRate(
    @Param('code') code: string,
    @Body() dto: UpdateExchangeRateDto,
  ) {
    return this.marketsService.updateExchangeRate(code, dto);
  }

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
