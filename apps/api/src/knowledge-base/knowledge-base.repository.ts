import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type PrismaTx = any;

@Injectable()
export class KnowledgeBaseRepository {
  constructor(private readonly prisma: PrismaService) {}

  private db(tx?: PrismaTx) {
    return tx ?? this.prisma;
  }

  async findCategories() {
    return this.db().knowledgeBaseCategory.findMany({
      orderBy: { position: 'asc' },
      include: { _count: { select: { articles: { where: { published: true } } } } },
    });
  }

  async findCategoryBySlug(slug: string) {
    return this.db().knowledgeBaseCategory.findUnique({ where: { slug } });
  }

  async createCategory(data: { name: string; slug: string; position?: number }) {
    return this.db().knowledgeBaseCategory.create({ data });
  }

  async updateCategory(id: string, data: { name?: string; slug?: string; position?: number }) {
    return this.db().knowledgeBaseCategory.update({ where: { id }, data });
  }

  async deleteCategory(id: string) {
    return this.db().knowledgeBaseCategory.delete({ where: { id } });
  }

  async findArticles(categorySlug?: string, search?: string) {
    const where: any = { published: true };
    if (categorySlug) {
      const cat = await this.db().knowledgeBaseCategory.findUnique({ where: { slug: categorySlug } });
      if (cat) where.categoryId = cat.id;
    }
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { body: { contains: search, mode: 'insensitive' } },
      ];
    }
    return this.db().knowledgeBaseArticle.findMany({
      where,
      include: { category: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findArticleById(id: string) {
    return this.db().knowledgeBaseArticle.findUnique({
      where: { id },
      include: { category: true },
    });
  }

  async findArticleBySlug(slug: string) {
    return this.db().knowledgeBaseArticle.findUnique({
      where: { slug },
      include: { category: true },
    });
  }

  async createArticle(data: {
    categoryId: string;
    title: string;
    slug: string;
    body: string;
    published?: boolean;
  }) {
    return this.db().knowledgeBaseArticle.create({
      data,
      include: { category: true },
    });
  }

  async updateArticle(id: string, data: { title?: string; slug?: string; body?: string; published?: boolean; categoryId?: string }) {
    return this.db().knowledgeBaseArticle.update({
      where: { id },
      data,
      include: { category: true },
    });
  }

  async deleteArticle(id: string) {
    return this.db().knowledgeBaseArticle.delete({ where: { id } });
  }

  async voteArticle(id: string, helpful: boolean) {
    const field = helpful ? 'helpful' : 'unhelpful';
    return this.db().knowledgeBaseArticle.update({
      where: { id },
      data: { [field]: { increment: 1 } },
    });
  }
}
