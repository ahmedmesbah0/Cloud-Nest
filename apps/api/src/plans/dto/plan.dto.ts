import { IsString, IsOptional, IsInt, IsBoolean, Min, Max, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePlanDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiProperty()
  @IsString()
  @MaxLength(191)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(191)
  description?: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  priceCredits!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  billingPeriodDays?: number;

  @ApiProperty()
  @IsInt()
  @Min(1)
  cpuCores!: number;

  @ApiProperty()
  @IsInt()
  @Min(64)
  memoryMb!: number;

  @ApiProperty()
  @IsInt()
  @Min(1)
  diskGb!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  backupLimit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  snapshotLimit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  serverLimit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  nodeIds?: number[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  templateId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  allowedUpgradePlanIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  allowedDowngradePlanIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  extraChargePercent?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  extraChargeName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  taxRatePercent?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  minSubscriptionDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  maxSubscriptions?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enableCustomPricing?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cardBackgroundImage?: string;

  @ApiPropertyOptional()
  @IsOptional()
  sliderConfig?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdatePlanDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(191)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(191)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  priceCredits?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  billingPeriodDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  cpuCores?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(64)
  memoryMb?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  diskGb?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  backupLimit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  snapshotLimit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  serverLimit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  nodeIds?: number[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  templateId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  allowedUpgradePlanIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  allowedDowngradePlanIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  extraChargePercent?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  extraChargeName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  taxRatePercent?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  minSubscriptionDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  maxSubscriptions?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enableCustomPricing?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cardBackgroundImage?: string;

  @ApiPropertyOptional()
  @IsOptional()
  sliderConfig?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
