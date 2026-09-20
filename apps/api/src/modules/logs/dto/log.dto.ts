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
  /** How bad it was — information, a warning, or an error. */
  @IsIn(LOG_LEVELS) level!: (typeof LOG_LEVELS)[number];
  /** What happened, as the app or the browser saw it. */
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

/**
 * What the app or the browser saw, sent up in batches.
 *
 * Queued on the device until it can be sent, because the moment worth
 * reporting is often the moment the network was not there.
 */
export class ClientLogBatchDto {
  /** Which one is reporting — the phone app, or the browser. */
  @IsIn(['app', 'web']) client!: 'app' | 'web';
  /** Which platform it was on, so an iOS-only fault is visible as one. */
  @IsOptional() @IsString() @MaxLength(40) platform?: string;
  /**
   * Which version of the app was running. What tells a fault that is already
   * fixed from one that is not.
   */
  @IsOptional() @IsString() @MaxLength(40) appVersion?: string;

  /** The entries themselves — a batch, not a backlog dump. */
  @IsArray()
  @ArrayMaxSize(MAX_BATCH)
  @ValidateNested({ each: true })
  @Type(() => ClientLogEntryDto)
  entries!: ClientLogEntryDto[];
}
