import { IsString, MaxLength, MinLength } from 'class-validator';
import { UpdateDisplayNameRequest } from '@cardquorum/shared';

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
