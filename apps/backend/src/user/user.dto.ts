import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import {
  DeleteAccountRequest,
  UpdateDisplayNameRequest,
  UpdateUsernameRequest,
} from '@cardquorum/shared';

export class UpdateUsernameDto implements UpdateUsernameRequest {
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  username!: string;
}

export class UpdateDisplayNameDto implements UpdateDisplayNameRequest {
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  displayName!: string;
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
