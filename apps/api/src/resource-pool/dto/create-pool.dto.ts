import { IsInt, IsString, IsOptional, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreatePoolDto {
  @ApiProperty()
  @IsString()
  userId: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  totalCores: number;

  @ApiProperty()
  @IsInt()
  @Min(1)
  totalMemoryMb: number;

  @ApiProperty()
  @IsInt()
  @Min(1)
  totalDiskGb: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  totalIps?: number;
}

export class UpdatePoolDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  totalCores?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  totalMemoryMb?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  totalDiskGb?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  totalIps?: number;
}

export class AllocateResourcesDto {
  @ApiProperty()
  @IsString()
  poolId: string;

  @ApiProperty()
  @IsString()
  vmId: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  cores: number;

  @ApiProperty()
  @IsInt()
  @Min(1)
  memoryMb: number;

  @ApiProperty()
  @IsInt()
  @Min(1)
  diskGb: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  ips?: number;
}
