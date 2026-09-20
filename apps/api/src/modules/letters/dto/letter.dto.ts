import { LetterKind } from '@prisma/client';
import { IsBoolean, IsDateString, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * The wording a kind of letter starts from, before it is about anybody.
 *
 * Kept by the shop so its letters read the same whoever writes them, and so
 * nobody is drafting an appointment letter from memory at five o'clock.
 */
export class LetterTemplateDto {
  /**
   * What kind of letter it is — an offer, an appointment, an NDA, a statement
   * of responsibilities, an experience or relieving letter, or a warning.
   */
  @IsEnum(LetterKind) kind!: LetterKind;
  /** What the shop calls this template when picking one. */
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  /**
   * The wording, with placeholders for the person, their role and the dates.
   * Filled in when a letter is actually issued.
   */
  @IsString() @MinLength(20) @MaxLength(20000) body!: string;
  /**
   * Whether it is still offered. Switching it off leaves every letter already
   * issued from it exactly as it was — those are in people's files.
   */
  @IsOptional() @IsBoolean() isActive?: boolean;
}

/** Issuing a letter to somebody. */
export class IssueLetterDto {
  /** Who it is about. */
  @IsString() employeeId!: string;
  /** What kind of letter it is. */
  @IsEnum(LetterKind) kind!: LetterKind;
  /** What it is called in their file — what somebody scans a list for. */
  @IsString() @MinLength(2) @MaxLength(200) title!: string;
  /**
   * The body as it will be printed.
   *
   * Sent already filled in, because whoever issues it has read it and may have
   * changed a line. Storing the template id and re-rendering later would make
   * the letter in somebody's file a thing that could change afterwards.
   */
  @IsString() @MinLength(20) @MaxLength(20000) body!: string;
  /** The date on the letter. Today if nobody says otherwise. */
  @IsOptional() @IsDateString() issuedOn?: string;
}

export class LetterQueryDto {
  /** Only one person's letters. */
  @IsOptional() @IsString() employeeId?: string;
  /** Only one kind — every warning issued, say. */
  @IsOptional() @IsEnum(LetterKind) kind?: LetterKind;
}
