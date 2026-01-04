import {
    Controller,
    Post,
    Delete,
    Get,
    Param,
    Query,
    UseGuards,
    UseInterceptors,
    UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { FilesService } from './files.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Controller('files')
export class FilesController {
    constructor(private readonly filesService: FilesService) { }

    @Post('upload')
    @UseGuards(JwtAuthGuard)
    @UseInterceptors(FileInterceptor('file'))
    uploadFile(
        @UploadedFile() file: Express.Multer.File,
        @Query('folder') folder?: string,
    ) {
        return this.filesService.uploadFile(file, folder);
    }

    @Delete(':key')
    @UseGuards(JwtAuthGuard)
    deleteFile(@Param('key') key: string) {
        return this.filesService.deleteFile(key);
    }

    @Get('signed-url/:key')
    @UseGuards(JwtAuthGuard)
    getSignedUrl(@Param('key') key: string) {
        return this.filesService.getSignedUrl(key);
    }
}
