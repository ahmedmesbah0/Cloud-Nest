import { IsString, IsInt, IsOptional, IsEnum, Min, MaxLength, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { VmStatus } from '@prisma/client';

export class CreateVmDto {
  @ApiProperty()
  @IsString()
  @MaxLength(64)
  name!: string;

  @ApiProperty()
  @IsUUID()
  poolId!: string;

  @ApiProperty({ description: 'Template ID (from VmTemplate table)' })
  @IsString()
  templateId!: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  cpuCores!: number;

  @ApiProperty()
  @IsInt()
  @Min(512)
  memoryMb!: number;

  @ApiProperty()
  @IsInt()
  @Min(5)
  diskGb!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sshKeyId?: string;
}

export class VmActionDto {
  @ApiProperty({ enum: ['start', 'stop', 'restart', 'shutdown'] })
  @IsEnum(['start', 'stop', 'restart', 'shutdown'])
  action!: 'start' | 'stop' | 'restart' | 'shutdown';
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
  templateId!: string;
}

export class MountIsoDto {
  @ApiProperty({ description: 'ISO filename (e.g. ubuntu-24.04.iso)' })
  @IsString()
  iso!: string;

  @ApiPropertyOptional({ description: 'Storage pool where ISO is stored' })
  @IsOptional()
  @IsString()
  storage?: string;
}

export class CreateBackupDto {
  @ApiPropertyOptional({ enum: ['snapshot', 'suspend', 'stop'] })
  @IsOptional()
  @IsEnum(['snapshot', 'suspend', 'stop'])
  mode?: 'snapshot' | 'suspend' | 'stop';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  storage?: string;

  @ApiPropertyOptional({ enum: ['lzo', 'gzip', 'zstd'] })
  @IsOptional()
  @IsEnum(['lzo', 'gzip', 'zstd'])
  compress?: 'lzo' | 'gzip' | 'zstd';
}

export class CreateSnapshotDto {
  @ApiProperty()
  @IsString()
  @MaxLength(128)
  name!: string;
}

export class QemuHardwareDto {
  @ApiPropertyOptional({ description: 'BIOS type: seabios|ovmf' })
  @IsOptional()
  @IsString()
  bios?: string;

  @ApiPropertyOptional({ description: 'Boot order (e.g. "order=ide2;virtio0;net0")' })
  @IsOptional()
  @IsString()
  boot?: string;

  @ApiPropertyOptional({ description: 'Machine type: pc|q35' })
  @IsOptional()
  @IsString()
  machine?: string;

  @ApiPropertyOptional({ description: 'CPU type: host|kvm64|x86-64-v2-AES' })
  @IsOptional()
  @IsString()
  cpu?: string;

  @ApiPropertyOptional({ description: 'CPU sockets' })
  @IsOptional()
  @IsInt()
  @Min(1)
  sockets?: number;

  @ApiPropertyOptional({ description: 'NUMA enabled' })
  @IsOptional()
  @IsString()
  numa?: string;

  @ApiPropertyOptional({ description: 'OS type: l26|other|win10|...' })
  @IsOptional()
  @IsString()
  ostype?: string;

  @ApiPropertyOptional({ description: 'QEMU agent enabled: 0|1' })
  @IsOptional()
  @IsString()
  agent?: string;

  @ApiPropertyOptional({ description: 'VGA type: std|virtio|serial0|qxl|...' })
  @IsOptional()
  @IsString()
  vga?: string;

  @ApiPropertyOptional({ description: 'USB tablet: 0|1' })
  @IsOptional()
  @IsString()
  tablet?: string;

  @ApiPropertyOptional({ description: 'Hotplug settings: disk|network|...' })
  @IsOptional()
  @IsString()
  hotplug?: string;

  @ApiPropertyOptional({ description: 'ACPI: 0|1' })
  @IsOptional()
  @IsString()
  acpi?: string;

  @ApiPropertyOptional({ description: 'KVM hardware virtualization: 0|1' })
  @IsOptional()
  @IsString()
  kvm?: string;

  @ApiPropertyOptional({ description: 'OVMF EFI disk configuration' })
  @IsOptional()
  @IsString()
  efidisk0?: string;

  @ApiPropertyOptional({ description: 'TPM state configuration' })
  @IsOptional()
  @IsString()
  tpmstate0?: string;

  @ApiPropertyOptional({ description: 'Custom args' })
  @IsOptional()
  @IsString()
  args?: string;
}

export class VmResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  userId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: VmStatus })
  status!: string;

  @ApiProperty()
  cpuCores!: number;

  @ApiProperty()
  memoryMb!: number;

  @ApiProperty()
  diskGb!: number;

  @ApiPropertyOptional()
  proxmoxId?: number;

  @ApiPropertyOptional()
  ipAddress?: string;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
