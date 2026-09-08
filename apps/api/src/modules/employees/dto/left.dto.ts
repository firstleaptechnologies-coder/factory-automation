import { IsDateString } from 'class-validator';

export class LeftDto {
  /** The last day they worked. */
  @IsDateString() leftOn!: string;
}
