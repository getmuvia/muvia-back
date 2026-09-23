import {
  Body,
  Controller,
  Header,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { FrontendErrorEventDto } from './dto/frontend-error-event.dto';
import { TelemetryService } from './telemetry.service';

@Controller('telemetry')
@UseGuards(ThrottlerGuard)
export class TelemetryController {
  constructor(private readonly telemetry: TelemetryService) {}

  @Post('frontend-errors')
  @HttpCode(HttpStatus.ACCEPTED)
  @Header('Cache-Control', 'no-store')
  captureFrontendError(@Body() event: FrontendErrorEventDto): {
    accepted: true;
    incidentId: string;
  } {
    this.telemetry.capture(event);
    return { accepted: true, incidentId: event.incidentId };
  }
}
