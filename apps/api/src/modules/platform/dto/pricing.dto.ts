import { IsArray, IsBoolean, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class SetTierPriceDto {
  @IsOptional() @IsNumber() @Min(0) monthlyPrice?: number;

  /** Replaces the tier's included set. Additive editing is done on the screen. */
  @IsOptional() @IsArray() @IsString({ each: true }) includedModules?: string[];

  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class SetModulePriceDto {
  /** Zero is allowed and means given away — which is not the same as unpriced. */
  @IsNumber() @Min(0) monthlyPrice!: number;
}

export class CreateTierDto {
  @IsString() key!: string;
  @IsString() label!: string;
  @IsOptional() @IsString() blurb?: string;
  @IsOptional() @IsNumber() @Min(0) monthlyPrice?: number;
  @IsOptional() @IsArray() @IsString({ each: true }) includedModules?: string[];
}

/** Asked before a tier is saved, so the screen can say who would lose what. */
export class TierEffectDto {
  @IsArray() @IsString({ each: true }) includedModules!: string[];
}
