import { IsString, MaxLength, MinLength } from 'class-validator';
import { PASSWORD_MAX, PASSWORD_MIN } from '@cardquorum/shared';

export class PasswordDto {
  @IsString()
  @MinLength(PASSWORD_MIN)
  @MaxLength(PASSWORD_MAX)
  password!: string;
}

export class LoginDto extends PasswordDto {
  @IsString()
  username!: string;
}

export class RegisterDto extends PasswordDto {
  @IsString()
  username!: string;
}
