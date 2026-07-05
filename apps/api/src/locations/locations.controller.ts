import { Controller, Get, Post, Put, Delete, Param, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { LocationsService } from './locations.service';
import { CreateLocationDto, UpdateLocationDto } from './dto/location.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../admin/admin.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Locations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/locations')
export class LocationsController {
  constructor(private readonly locationsService: LocationsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a location' })
  async create(@CurrentUser('id') userId: string, @Body() dto: CreateLocationDto) {
    return this.locationsService.create(dto, userId);
  }

  @Get()
  @ApiOperation({ summary: 'List all locations' })
  async findAll() {
    return this.locationsService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get location details' })
  async findById(@Param('id') id: string) {
    return this.locationsService.findById(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a location' })
  async update(@CurrentUser('id') userId: string, @Param('id') id: string, @Body() dto: UpdateLocationDto) {
    return this.locationsService.update(id, dto, userId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a location' })
  async delete(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.locationsService.delete(id, userId);
  }
}
