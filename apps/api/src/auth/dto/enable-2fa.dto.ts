import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class Enable2faDto {
  @ApiProperty()
  @IsString()
  token!: string;
}
