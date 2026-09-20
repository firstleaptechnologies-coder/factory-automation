import { IsArray, IsBoolean, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class SetTierPriceDto {
  /** What the tier costs a shop each month, in rupees. */
  @IsOptional() @IsNumber() @Min(0) monthlyPrice?: number;

  /** Replaces the tier's included set. Additive editing is done on the screen. */
  @IsOptional() @IsArray() @IsString({ each: true }) includedModules?: string[];

  /**
   * Whether the tier can still be sold. Switching it off takes it off the
   * price list and leaves every shop already on it exactly where they are —
   * withdrawing a tier is not the same as moving its customers.
   */
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class SetModulePriceDto {
  /** Zero is allowed and means given away — which is not the same as unpriced. */
  @IsNumber() @Min(0) monthlyPrice!: number;
}

/** A bundle we sell, rather than a checkbox per module. */
export class CreateTierDto {
  /**
   * A short key for it. Fixed once created, because every workspace on the
   * tier refers to it.
   */
  @IsString() key!: string;
  /** What it is called on the price list — "Punch", "Shop", "Works". */
  @IsString() label!: string;
  /** One line on what it is for, so whoever is selling knows which to offer. */
  @IsOptional() @IsString() blurb?: string;
  /** What it costs a shop each month, in rupees. */
  @IsOptional() @IsNumber() @Min(0) monthlyPrice?: number;
  /** Which modules come with it. */
  @IsOptional() @IsArray() @IsString({ each: true }) includedModules?: string[];
}

/** Asked before a tier is saved, so the screen can say who would lose what. */
export class TierEffectDto {
  /**
   * The set being considered, before it is saved. The answer says which shops
   * would lose which modules — taking something out of a tier is a change to
   * what existing customers already have, and it should not be discovered
   * after the fact.
   */
  @IsArray() @IsString({ each: true }) includedModules!: string[];
}
