import { IsString, Length } from 'class-validator';

export class VoidInvoiceDto {
  /** Why it was withdrawn. Kept on the row — a bill sent and withdrawn happened. */
  @IsString() @Length(3, 300) reason!: string;
}
