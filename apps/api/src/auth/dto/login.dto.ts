import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'admin' })
  @IsString()
  email!: string;

  @ApiProperty({ example: 'securePassword123' })
  @IsString()
  password!: string;
}
