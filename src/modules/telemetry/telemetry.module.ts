import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { TelemetryController } from './telemetry.controller';
import { TelemetryService } from './telemetry.service';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 10,
        blockDuration: 5 * 60_000,
      },
    ]),
  ],
  controllers: [TelemetryController],
  providers: [TelemetryService],
})
export class TelemetryModule {}
