import {
  Equals,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class FrontendErrorEventDto {
  @Equals(1)
  schemaVersion: 1;

  @IsUUID()
  incidentId: string;

  @IsUUID()
  correlationId: string;

  @IsISO8601({ strict: true })
  occurredAt: string;

  @IsIn(['global', 'http', 'application'])
  source: 'global' | 'http' | 'application';

  @IsIn(['warning', 'error', 'fatal'])
  severity: 'warning' | 'error' | 'fatal';

  @IsString()
  @MaxLength(500)
  message: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  errorName: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  stack: string | null;

  @IsString()
  @MaxLength(500)
  route: string;

  @IsString()
  @MaxLength(40)
  environment: string;

  @IsString()
  @MaxLength(64)
  release: string;

  @IsIn(['browser', 'server'])
  runtime: 'browser' | 'server';

  @IsOptional()
  @IsString()
  @MaxLength(100)
  context: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  httpMethod: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  httpPath: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(599)
  httpStatus: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  errorKind: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  errorCode: string | null;
}
