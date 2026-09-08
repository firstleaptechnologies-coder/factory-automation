import { LetterKind } from '@prisma/client';
import { IsBoolean, IsDateString, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class LetterTemplateDto {
  @IsEnum(LetterKind) kind!: LetterKind;
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsString() @MinLength(20) @MaxLength(20000) body!: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class IssueLetterDto {
  @IsString() employeeId!: string;
  @IsEnum(LetterKind) kind!: LetterKind;
  @IsString() @MinLength(2) @MaxLength(200) title!: string;
  /**
   * The body as it will be printed.
   *
   * Sent already filled in, because whoever issues it has read it and may have
   * changed a line. Storing the template id and re-rendering later would make
   * the letter in somebody's file a thing that could change afterwards.
   */
  @IsString() @MinLength(20) @MaxLength(20000) body!: string;
  @IsOptional() @IsDateString() issuedOn?: string;
}

export class LetterQueryDto {
  @IsOptional() @IsString() employeeId?: string;
  @IsOptional() @IsEnum(LetterKind) kind?: LetterKind;
}
