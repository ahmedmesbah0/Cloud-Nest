import { IsString, IsOptional, IsBoolean, MinLength, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateLocationDto {
  @ApiProperty({ example: 'US East' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @ApiProperty({ example: 'North America' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  region!: string;

  @ApiProperty({ example: 'United States' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  country!: string;

  @ApiPropertyOptional({ example: 'Datacenter 1' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  datacenter?: string;
}

export class UpdateLocationDto {
  @ApiPropertyOptional({ example: 'US West' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ example: 'North America' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  region?: string;

  @ApiPropertyOptional({ example: 'United States' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  country?: string;

  @ApiPropertyOptional({ example: 'Datacenter 2' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  datacenter?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
