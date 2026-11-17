import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { QuotationsService } from './quotations.service';
import { CreateQuotationDto } from './dto/create-quotation.dto';
import { RespondQuotationDto } from './dto/respond-quotation.dto';
import { QuotationFilterDto } from './dto/quotation-filter.dto';
import { ReadQuotationDto } from './dto/read-quotation.dto';

@Controller('quotations')
@UseGuards(JwtAuthGuard)
export class QuotationsController {
  constructor(private readonly quotations: QuotationsService) {}

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateQuotationDto,
  ) {
    return this.quotations.create(user, dto);
  }

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() filter: QuotationFilterDto,
  ) {
    return this.quotations.list(user, filter);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.quotations.findOne(id, userId);
  }

  @Post(':id/read')
  @HttpCode(204)
  markRead(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: ReadQuotationDto,
  ) {
    return this.quotations.markRead(id, userId, dto.respondedAt);
  }

  @Patch(':id/response')
  @UseGuards(RolesGuard)
  @Roles(UserRole.VENDOR)
  respond(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') sellerId: string,
    @Body() dto: RespondQuotationDto,
  ) {
    return this.quotations.respond(id, sellerId, dto);
  }
}
