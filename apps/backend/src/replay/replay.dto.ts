import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class GetSessionsQueryDto {
  @IsOptional()
  @IsString()
  gameType?: string;

  @IsOptional()
  @IsString()
  @IsIn(['true', 'false'])
  includeIncomplete?: 'true' | 'false';

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
