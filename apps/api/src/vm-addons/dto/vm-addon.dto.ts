import { IsInt, IsOptional, Min, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const ADDON_TYPES = ['extra_disk', 'extra_ip', 'extra_backup_slots', 'extra_snapshot_slots', 'extra_bandwidth'] as const;

export class PurchaseAddOnDto {
  @ApiProperty({ enum: ADDON_TYPES })
  @IsIn(ADDON_TYPES)
  type!: string;

  @ApiProperty({ default: 1 })
  @IsInt()
  @Min(1)
  quantity!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  priceCredits?: number;
}
