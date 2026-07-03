import { IsString, IsInt, IsOptional, IsEnum, Min, MaxLength, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { VmStatus } from '@prisma/client';

export class CreateVmDto {
  @ApiProperty()
  @IsString()
  @MaxLength(64)
  name: string;

  @ApiProperty()
  @IsUUID()
  poolId: string;

  @ApiProperty({ description: 'Template ID (from VmTemplate table)' })
  @IsString()
  templateId: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  cpuCores: number;

  @ApiProperty()
  @IsInt()
  @Min(512)
  memoryMb: number;

  @ApiProperty()
  @IsInt()
  @Min(5)
  diskGb: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sshKeyId?: string;
}

export class VmActionDto {
  @ApiProperty({ enum: ['start', 'stop', 'restart', 'shutdown'] })
  @IsEnum(['start', 'stop', 'restart', 'shutdown'])
  action: 'start' | 'stop' | 'restart' | 'shutdown';
}

export class ResizeVmDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  cpuCores?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(512)
  memoryMb?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(5)
  diskGb?: number;
}

export class ReinstallVmDto {
  @ApiProperty()
  @IsString()
  templateId: string;
}

export class VmResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  userId: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ enum: VmStatus })
  status: string;

  @ApiProperty()
  cpuCores: number;

  @ApiProperty()
  memoryMb: number;

  @ApiProperty()
  diskGb: number;

  @ApiPropertyOptional()
  proxmoxId?: number;

  @ApiPropertyOptional()
  ipAddress?: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
