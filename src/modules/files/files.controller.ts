import {
  Body,
  Controller,
  Delete,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CreateUploadPolicyDto } from './dto/create-upload-policy.dto';
import { FinalizeUploadDto } from './dto/finalize-upload.dto';
import { FilesService } from './files.service';

@Controller('files')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.VENDOR)
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Post('upload-url')
  @UseGuards(ThrottlerGuard)
  createUploadPolicy(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateUploadPolicyDto,
  ) {
    return this.filesService.createUploadPolicy(userId, dto);
  }

  @Post('finalize')
  @UseGuards(ThrottlerGuard)
  finalizeUpload(
    @CurrentUser('id') userId: string,
    @Body() dto: FinalizeUploadDto,
  ) {
    return this.filesService.finalizeUpload(userId, dto.key);
  }

  @Delete(':key')
  deleteFile(
    @CurrentUser('id') userId: string,
    @Param('key') key: string,
  ): Promise<void> {
    return this.filesService.deleteFile(userId, key);
  }
}
