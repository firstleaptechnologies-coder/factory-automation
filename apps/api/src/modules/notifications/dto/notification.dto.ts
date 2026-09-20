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
  /** The heading the notification arrives with. Empty keeps the product's own. */
  @IsOptional() @IsString() @MaxLength(120) title?: string;
  /** The line under it. Empty keeps the product's own. */
  @IsOptional() @IsString() @MaxLength(400) body?: string;
  /**
   * Whether this notification is sent at all. Switching one off is how a shop
   * stops the kind of alert it does not want — a product that cannot be
   * quietened is one people turn off entirely.
   */
  @IsOptional() @IsBoolean() enabled?: boolean;
}
