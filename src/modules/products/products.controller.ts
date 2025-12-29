import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductFilterDto } from './dto/product-filter.dto';
import { CreateProductAssetDto } from './dto/create-product-asset.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../users/interfaces/user-role';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) { }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.VENDOR)
  create(
    @CurrentUser('id') sellerId: string,
    @Body() createProductDto: CreateProductDto,
  ) {
    return this.productsService.create(sellerId, createProductDto);
  }

  @Get()
  findAll(@Query() filterDto: ProductFilterDto) {
    return this.productsService.findAll(filterDto);
  }

  @Get('my-products')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.VENDOR)
  findMyProducts(@CurrentUser('id') sellerId: string) {
    return this.productsService.findBySeller(sellerId);
  }

  @Get('search')
  findByKeywords(@Query('keywords') keywords: string) {
    const keywordArray = keywords.split(',').map((k) => k.trim());
    return this.productsService.findByKeywords(keywordArray);
  }

  @Get('category/:categoryId')
  findByCategory(@Param('categoryId', ParseUUIDPipe) categoryId: string) {
    return this.productsService.findByCategory(categoryId);
  }

  @Get('seller/:sellerId')
  findBySeller(@Param('sellerId', ParseUUIDPipe) sellerId: string) {
    return this.productsService.findBySeller(sellerId);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.productsService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.VENDOR)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') sellerId: string,
    @Body() updateProductDto: UpdateProductDto,
  ) {
    return this.productsService.update(id, sellerId, updateProductDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.VENDOR)
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') sellerId: string,
  ) {
    return this.productsService.remove(id, sellerId);
  }

  @Post(':id/assets')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.VENDOR)
  addAsset(
    @Param('id', ParseUUIDPipe) productId: string,
    @CurrentUser('id') sellerId: string,
    @Body() assetDto: CreateProductAssetDto,
  ) {
    return this.productsService.addAsset(productId, sellerId, assetDto);
  }

  @Delete(':id/assets/:assetId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.VENDOR)
  removeAsset(
    @Param('id', ParseUUIDPipe) productId: string,
    @Param('assetId', ParseUUIDPipe) assetId: string,
    @CurrentUser('id') sellerId: string,
  ) {
    return this.productsService.removeAsset(productId, assetId, sellerId);
  }

  @Patch(':id/assets/:assetId/primary')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.VENDOR)
  setPrimaryAsset(
    @Param('id', ParseUUIDPipe) productId: string,
    @Param('assetId', ParseUUIDPipe) assetId: string,
    @CurrentUser('id') sellerId: string,
  ) {
    return this.productsService.setPrimaryAsset(productId, assetId, sellerId);
  }
}
