import { Controller, Get, Post, Put, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { KnowledgeBaseService } from './knowledge-base.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Permissions } from '../auth/decorators/permissions.decorator';

@ApiTags('Knowledge Base')
@Controller('knowledge-base')
export class KnowledgeBaseController {
  constructor(private readonly service: KnowledgeBaseService) {}

  @Get('categories')
  @ApiOperation({ summary: 'List knowledge base categories' })
  async listCategories() {
    return this.service.listCategories();
  }

  @Post('categories')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Permissions('admin:knowledge-base')
  @ApiOperation({ summary: 'Create a category (admin)' })
  async createCategory(@Body() dto: { name: string; slug: string; position?: number }) {
    return this.service.createCategory(dto.name, dto.slug, dto.position);
  }

  @Put('categories/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Permissions('admin:knowledge-base')
  @ApiOperation({ summary: 'Update a category (admin)' })
  async updateCategory(@Param('id') id: string, @Body() dto: { name?: string; slug?: string; position?: number }) {
    return this.service.updateCategory(id, dto);
  }

  @Delete('categories/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Permissions('admin:knowledge-base')
  @ApiOperation({ summary: 'Delete a category (admin)' })
  async deleteCategory(@Param('id') id: string) {
    return this.service.deleteCategory(id);
  }

  @Get('articles')
  @ApiOperation({ summary: 'List published articles (optional ?category=, ?search=)' })
  async listArticles(
    @Query('category') categorySlug?: string,
    @Query('search') search?: string,
  ) {
    return this.service.listArticles(categorySlug, search);
  }

  @Get('articles/:slug')
  @ApiOperation({ summary: 'Get a single article by slug' })
  async getArticle(@Param('slug') slug: string) {
    return this.service.getArticle(slug);
  }

  @Post('articles')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Permissions('admin:knowledge-base')
  @ApiOperation({ summary: 'Create an article (admin)' })
  async createArticle(@Body() dto: { categoryId: string; title: string; slug: string; body: string; published?: boolean }) {
    return this.service.createArticle(dto);
  }

  @Put('articles/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Permissions('admin:knowledge-base')
  @ApiOperation({ summary: 'Update an article (admin)' })
  async updateArticle(@Param('id') id: string, @Body() dto: any) {
    return this.service.updateArticle(id, dto);
  }

  @Delete('articles/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Permissions('admin:knowledge-base')
  @ApiOperation({ summary: 'Delete an article (admin)' })
  async deleteArticle(@Param('id') id: string) {
    return this.service.deleteArticle(id);
  }

  @Post('articles/:slug/vote')
  @ApiOperation({ summary: 'Vote on article helpfulness' })
  async vote(@Param('slug') slug: string, @Body('helpful') helpful: boolean) {
    return this.service.vote(slug, helpful);
  }
}
