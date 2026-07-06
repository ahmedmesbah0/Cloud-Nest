import { Controller, Get, Put, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { FeatureTogglesService } from './feature-toggles.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Feature Toggles')
@Controller('features')
export class FeatureTogglesController {
  constructor(private readonly service: FeatureTogglesService) {}

  @Get()
  @ApiOperation({ summary: 'Get all feature toggles (public)' })
  async getAll() {
    return this.service.getAll();
  }

  @Put()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Set a feature toggle (admin)' })
  async set(@Body() dto: { key: string; enabled: boolean }) {
    return this.service.set(dto.key, dto.enabled);
  }
}
