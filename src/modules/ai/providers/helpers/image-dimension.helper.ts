import { Logger } from '@nestjs/common';

export interface ImageDimensions {
    width: number;
    height: number;
}

const logger = new Logger('ImageDimensionHelper');

export function getImageDimensions(buffer: Buffer): ImageDimensions | null {
    try {
        if (isPng(buffer)) {
            const width = buffer.readUInt32BE(16);
            const height = buffer.readUInt32BE(20);
            return { width, height };
        }

        if (isJpeg(buffer)) {
            logger.debug('📷 Detected JPEG format');
            const orientation = getJpegExifOrientation(buffer);
            const needsRotation = orientation >= 5 && orientation <= 8;

            let offset = 2;
            while (offset < buffer.length - 10) {
                if (buffer[offset] === 0xFF) {
                    const marker = buffer[offset + 1];
                    if (marker >= 0xC0 && marker <= 0xC2) {
                        let height = buffer.readUInt16BE(offset + 5);
                        let width = buffer.readUInt16BE(offset + 7);

                        if (needsRotation) {
                            logger.debug(`📷 EXIF orientation ${orientation} - swapping dimensions`);
                            [width, height] = [height, width];
                        }

                        logger.debug(`📷 JPEG dimensions: ${width}x${height}`);
                        return { width, height };
                    }
                    if (offset + 2 < buffer.length) {
                        const length = buffer.readUInt16BE(offset + 2);
                        offset += 2 + length;
                    } else {
                        break;
                    }
                } else {
                    offset++;
                }
            }
            logger.warn('📷 JPEG: Could not find SOF marker');
        }

        if (isWebP(buffer)) {
            logger.debug('📷 Detected WebP format');
            const width = buffer.readUInt16LE(26) & 0x3FFF;
            const height = buffer.readUInt16LE(28) & 0x3FFF;
            if (width > 0 && height > 0) {
                logger.debug(`📷 WebP dimensions: ${width}x${height}`);
                return { width, height };
            }
        }

        logger.warn(`📷 Unknown format. First 4 bytes: ${buffer.slice(0, 4).toString('hex')}`);
    } catch (e) {
        logger.debug(`Could not parse dimensions: ${e.message}`);
    }
    return null;
}

export function getJpegExifOrientation(buffer: Buffer): number {
    try {
        let offset = 2;
        while (offset < buffer.length - 12) {
            if (buffer[offset] === 0xFF && buffer[offset + 1] === 0xE1) {
                const exifStart = offset + 4;
                if (buffer.slice(exifStart, exifStart + 4).toString() !== 'Exif') break;

                const tiffStart = exifStart + 6;
                const isLittleEndian = buffer.slice(tiffStart, tiffStart + 2).toString() === 'II';
                const ifdOffset = tiffStart + 8;
                const entryCount = isLittleEndian
                    ? buffer.readUInt16LE(ifdOffset)
                    : buffer.readUInt16BE(ifdOffset);

                for (let i = 0; i < entryCount; i++) {
                    const entryOffset = ifdOffset + 2 + (i * 12);
                    const tag = isLittleEndian
                        ? buffer.readUInt16LE(entryOffset)
                        : buffer.readUInt16BE(entryOffset);

                    if (tag === 0x0112) {
                        const orientation = isLittleEndian
                            ? buffer.readUInt16LE(entryOffset + 8)
                            : buffer.readUInt16BE(entryOffset + 8);
                        logger.debug(`📷 EXIF orientation: ${orientation}`);
                        return orientation;
                    }
                }
                break;
            }

            if (buffer[offset] === 0xFF) {
                const length = buffer.readUInt16BE(offset + 2);
                offset += 2 + length;
            } else {
                offset++;
            }
        }
    } catch (e) {
        logger.debug(`Could not read EXIF: ${e.message}`);
    }
    return 1;
}

function isPng(buffer: Buffer): boolean {
    return buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47;
}

function isJpeg(buffer: Buffer): boolean {
    return buffer[0] === 0xFF && buffer[1] === 0xD8;
}

function isWebP(buffer: Buffer): boolean {
    return buffer.slice(0, 4).toString() === 'RIFF' && buffer.slice(8, 12).toString() === 'WEBP';
}
