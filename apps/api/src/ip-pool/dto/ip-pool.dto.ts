import { IsString, IsOptional, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateIpPoolDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiProperty({ example: '10.0.0.0/24' })
  @IsString()
  subnet!: string;

  @ApiProperty({ example: '10.0.0.1' })
  @IsString()
  gateway!: string;
}

export class UpdateIpPoolDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  gateway?: string;
}

export class AddIpBlockDto {
  @ApiProperty()
  @IsString()
  poolId!: string;

  @ApiProperty({ example: '10.0.0.1' })
  @IsString()
  address!: string;
}
