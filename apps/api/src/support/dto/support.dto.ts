import { IsString, IsBoolean, IsOptional, IsArray, MinLength, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTicketDto {
  @ApiProperty()
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  subject!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  message!: string;
}

export class ReplyTicketDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  message!: string;

  @ApiPropertyOptional({ description: 'Internal staff-only note' })
  @IsOptional()
  @IsBoolean()
  isStaffOnly?: boolean;

  @ApiPropertyOptional({ description: 'File attachments' })
  @IsOptional()
  @IsArray()
  attachments?: { filename: string; mimeType: string; size: number; path: string }[];
}
