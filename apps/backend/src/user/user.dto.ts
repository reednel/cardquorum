import { IsOptional, IsString, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';
import {
  DeleteAccountRequest,
  DISPLAY_NAME_MAX,
  UpdateDisplayNameRequest,
  UpdateUsernameRequest,
  USERNAME_MAX,
  USERNAME_MIN,
} from '@cardquorum/shared';

export class UpdateUsernameDto implements UpdateUsernameRequest {
  @IsString()
  @MinLength(USERNAME_MIN)
  @MaxLength(USERNAME_MAX)
  @Matches(/^[a-zA-Z][a-zA-Z0-9_]*$/, {
    message: 'Username must start with a letter and contain only letters, numbers, and underscores',
  })
  username!: string;
}

export class UpdateDisplayNameDto implements UpdateDisplayNameRequest {
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MinLength(1)
  @MaxLength(DISPLAY_NAME_MAX)
  displayName!: string | null;
}

export class SearchUsersDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  q!: string;
}

export class DeleteAccountDto implements DeleteAccountRequest {
  @IsString()
  @IsOptional()
  password?: string;
}
