import { Controller, Get, Put, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { NotificationPreferencesService } from './notification-preferences.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Notification Preferences')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notification-preferences')
export class NotificationPreferencesController {
  constructor(private readonly service: NotificationPreferencesService) {}

  @Get()
  @ApiOperation({ summary: 'List notification preferences' })
  async list(@CurrentUser('id') userId: string) {
    return this.service.list(userId);
  }

  @Put()
  @ApiOperation({ summary: 'Update a notification preference' })
  async update(
    @CurrentUser('id') userId: string,
    @Body() dto: { type: string; muted: boolean },
  ) {
    return this.service.update(userId, dto.type, dto.muted);
  }
}
