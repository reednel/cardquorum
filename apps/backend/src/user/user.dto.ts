import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import {
  DISPLAY_NAME_MAX,
  USERNAME_MAX,
  USERNAME_MIN,
  type DeleteAccountRequest,
  type UpdateDisplayNameRequest,
  type UpdateUsernameRequest,
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

export class UpdateColorPreferenceDto {
  @IsInt()
  @Min(0)
  @Max(340)
  hue!: number;
}
