import { Logger } from '@nestjs/common';

const logger = new Logger('AspectRatioHelper');

const SUPPORTED_RATIOS = [
    { name: '21:9', value: 21 / 9 },
    { name: '16:9', value: 16 / 9 },
    { name: '3:2', value: 3 / 2 },
    { name: '4:3', value: 4 / 3 },
    { name: '5:4', value: 5 / 4 },
    { name: '1:1', value: 1 },
    { name: '4:5', value: 4 / 5 },
    { name: '3:4', value: 3 / 4 },
    { name: '2:3', value: 2 / 3 },
    { name: '9:16', value: 9 / 16 },
];

export function mapToSupportedAspectRatio(ratio: number): string {
    let closest = SUPPORTED_RATIOS[0];
    let minDiff = Math.abs(ratio - closest.value);

    for (const supported of SUPPORTED_RATIOS) {
        const diff = Math.abs(ratio - supported.value);
        if (diff < minDiff) {
            minDiff = diff;
            closest = supported;
        }
    }

    logger.debug(`Ratio ${ratio.toFixed(2)} → ${closest.name}`);
    return closest.name;
}

export function calculateAspectRatio(width: number, height: number): number {
    return width / height;
}
