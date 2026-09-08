import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class NotificationQueryDto {
  /** Only the ones not yet read. */
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  unread?: boolean;

  /** Paging backwards through what has already happened. */
  @IsOptional() @IsString() before?: string;
}

/**
 * A shop's own wording for one trigger.
 *
 * Left empty, the product's own words stand — an empty title is "use the
 * default", not "say nothing".
 */
export class NotificationSettingDto {
  @IsOptional() @IsString() @MaxLength(120) title?: string;
  @IsOptional() @IsString() @MaxLength(400) body?: string;
  @IsOptional() @IsBoolean() enabled?: boolean;
}
