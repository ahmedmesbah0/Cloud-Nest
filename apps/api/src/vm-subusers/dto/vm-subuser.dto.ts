import { IsString, IsEmail, IsArray, IsOptional, ArrayMinSize } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export const VM_SUBUSER_PERMISSIONS = ['power', 'console', 'backup', 'reinstall', 'settings', 'activity.read'] as const;

export class AddSubuserDto {
  @ApiProperty({ description: 'Email of the user to add as subuser' })
  @IsEmail()
  email!: string;

  @ApiProperty({ description: 'Permissions to grant', default: ['power', 'console'] })
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  @IsOptional()
  permissions?: string[];
}

export class UpdateSubuserPermissionsDto {
  @ApiProperty({ description: 'Updated permissions list' })
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  permissions!: string[];
}
