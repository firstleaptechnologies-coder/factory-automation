import { IsString, MinLength } from 'class-validator';

export class LoginDto {
  /** Employee code or phone — operators do not want to type an email. */
  @IsString()
  identifier: string;

  @IsString()
  @MinLength(4)
  password: string;
}
