import { Controller, Get, Post, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SupportService } from './support.service';
import { CreateTicketDto, ReplyTicketDto } from './dto/support.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Support')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('support-tickets')
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  @Get()
  @ApiOperation({ summary: 'List support tickets' })
  async list(@CurrentUser('id') userId: string) {
    return this.supportService.listTickets(userId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a support ticket' })
  async create(@CurrentUser('id') userId: string, @Body() dto: CreateTicketDto) {
    return this.supportService.createTicket(userId, dto.subject, dto.message);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get ticket detail with messages' })
  async get(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.supportService.getTicket(userId, id);
  }

  @Post(':id/messages')
  @ApiOperation({ summary: 'Reply to a support ticket' })
  async reply(@CurrentUser('id') userId: string, @Param('id') id: string, @Body() dto: ReplyTicketDto) {
    return this.supportService.reply(userId, id, dto.message);
  }
}
