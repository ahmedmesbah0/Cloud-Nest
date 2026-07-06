import { Injectable, NotFoundException } from '@nestjs/common';
import { KnowledgeBaseRepository } from './knowledge-base.repository';

@Injectable()
export class KnowledgeBaseService {
  constructor(
    private readonly repo: KnowledgeBaseRepository,
  ) {}

  // ── Categories ──

  async listCategories() {
    return this.repo.findCategories();
  }

  async createCategory(name: string, slug: string, position?: number) {
    return this.repo.createCategory({ name, slug, position });
  }

  async updateCategory(id: string, data: { name?: string; slug?: string; position?: number }) {
    return this.repo.updateCategory(id, data);
  }

  async deleteCategory(id: string) {
    return this.repo.deleteCategory(id);
  }

  // ── Articles ──

  async listArticles(categorySlug?: string, search?: string) {
    return this.repo.findArticles(categorySlug, search);
  }

  async getArticle(slug: string) {
    const article = await this.repo.findArticleBySlug(slug);
    if (!article) throw new NotFoundException('Article not found');
    return article;
  }

  async createArticle(data: { categoryId: string; title: string; slug: string; body: string; published?: boolean }) {
    return this.repo.createArticle(data);
  }

  async updateArticle(id: string, data: { title?: string; slug?: string; body?: string; published?: boolean; categoryId?: string }) {
    const article = await this.repo.findArticleById(id);
    if (!article) throw new NotFoundException('Article not found');
    return this.repo.updateArticle(id, data);
  }

  async deleteArticle(id: string) {
    const article = await this.repo.findArticleById(id);
    if (!article) throw new NotFoundException('Article not found');
    return this.repo.deleteArticle(id);
  }

  async vote(slug: string, helpful: boolean) {
    const article = await this.repo.findArticleBySlug(slug);
    if (!article) throw new NotFoundException('Article not found');
    return this.repo.voteArticle(article.id, helpful);
  }
}
