import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export const LOG_LEVELS = ['info', 'warn', 'error'] as const;

/** How many a client may send at once. A batch, not a backlog dump. */
export const MAX_BATCH = 50;

export class ClientLogEntryDto {
  @IsIn(LOG_LEVELS) level!: (typeof LOG_LEVELS)[number];
  @IsString() @MaxLength(2000) message!: string;
  /** When it happened on the device, which is not when it arrived. */
  @IsDateString() at!: string;
  /**
   * Whatever the client thought was worth sending. Never a token: the server
   * cannot tell one string from another, so the clients are the ones that must
   * not put one here.
   */
  @IsOptional() @IsObject() context?: Record<string, unknown>;
}

export class ClientLogBatchDto {
  @IsIn(['app', 'web']) client!: 'app' | 'web';
  @IsOptional() @IsString() @MaxLength(40) platform?: string;
  @IsOptional() @IsString() @MaxLength(40) appVersion?: string;

  @IsArray()
  @ArrayMaxSize(MAX_BATCH)
  @ValidateNested({ each: true })
  @Type(() => ClientLogEntryDto)
  entries!: ClientLogEntryDto[];
}
