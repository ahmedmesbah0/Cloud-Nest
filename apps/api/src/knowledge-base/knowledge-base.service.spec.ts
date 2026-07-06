import { Test, TestingModule } from '@nestjs/testing';
import { KnowledgeBaseService } from './knowledge-base.service';
import { KnowledgeBaseRepository } from './knowledge-base.repository';

describe('KnowledgeBaseService', () => {
  let service: KnowledgeBaseService;
  let mockRepo: any;

  const categories = new Map<string, any>();
  const articles = new Map<string, any>();

  beforeEach(async () => {
    categories.clear();
    articles.clear();

    mockRepo = {
      findCategories: jest.fn(async () => Array.from(categories.values())),
      createCategory: jest.fn(async (data: any) => {
        const cat = { id: `cat-${categories.size + 1}`, ...data, position: data.position ?? 0 };
        categories.set(cat.id, cat);
        return cat;
      }),
      updateCategory: jest.fn(async (id: string, data: any) => {
        const cat = categories.get(id);
        if (cat) categories.set(id, { ...cat, ...data });
        return categories.get(id);
      }),
      deleteCategory: jest.fn(async (id: string) => { categories.delete(id); }),
      createArticle: jest.fn(async (data: any) => {
        const art = { id: `art-${articles.size + 1}`, ...data, helpful: 0, unhelpful: 0, createdAt: new Date() };
        articles.set(art.id, art);
        return art;
      }),
      findArticles: jest.fn(async (categorySlug?: string, search?: string) => {
        let result = Array.from(articles.values()).filter((a: any) => a.published !== false);
        if (categorySlug) {
          const cat = Array.from(categories.values()).find((c: any) => c.slug === categorySlug);
          if (cat) result = result.filter((a: any) => a.categoryId === cat.id);
        }
        if (search) {
          const q = search.toLowerCase();
          result = result.filter((a: any) => a.title.toLowerCase().includes(q) || a.body.toLowerCase().includes(q));
        }
        return result;
      }),
      findArticleBySlug: jest.fn(async (slug: string) =>
        Array.from(articles.values()).find((a: any) => a.slug === slug) ?? null,
      ),
      findArticleById: jest.fn(async (id: string) =>
        articles.get(id) ?? null,
      ),
      updateArticle: jest.fn(async (id: string, data: any) => {
        const art = articles.get(id);
        if (art) articles.set(id, { ...art, ...data });
        return articles.get(id);
      }),
      deleteArticle: jest.fn(async (id: string) => { articles.delete(id); }),
      voteArticle: jest.fn(async (id: string, helpful: boolean) => {
        const art = articles.get(id);
        if (art) {
          const field = helpful ? 'helpful' : 'unhelpful';
          articles.set(id, { ...art, [field]: art[field] + 1 });
        }
        return articles.get(id);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KnowledgeBaseService,
        { provide: KnowledgeBaseRepository, useValue: mockRepo },
      ],
    }).compile();

    service = module.get<KnowledgeBaseService>(KnowledgeBaseService);
  });

  describe('categories', () => {
    it('creates and lists categories', async () => {
      await service.createCategory('Getting Started', 'getting-started', 1);
      await service.createCategory('Advanced', 'advanced', 2);
      const list = await service.listCategories();
      expect(list).toHaveLength(2);
    });

    it('updates a category', async () => {
      const cat = await service.createCategory('Old Name', 'old-slug');
      await service.updateCategory(cat.id, { name: 'New Name' });
      expect(mockRepo.updateCategory).toHaveBeenCalledWith(cat.id, { name: 'New Name' });
    });

    it('deletes a category', async () => {
      const cat = await service.createCategory('To Delete', 'delete-me');
      await service.deleteCategory(cat.id);
      expect(categories.size).toBe(0);
    });
  });

  describe('articles', () => {
    it('creates and lists articles', async () => {
      const cat = await service.createCategory('General', 'general');
      await service.createArticle({ categoryId: cat.id, title: 'How to start', slug: 'how-to-start', body: '...', published: true });
      await service.createArticle({ categoryId: cat.id, title: 'Draft', slug: 'draft', body: '...', published: false });
      const list = await service.listArticles();
      // Only published articles appear in public listing
      expect(list).toHaveLength(1);
      expect(list[0].slug).toBe('how-to-start');
    });

    it('filters by category slug', async () => {
      const cat1 = await service.createCategory('A', 'a');
      const cat2 = await service.createCategory('B', 'b');
      await service.createArticle({ categoryId: cat1.id, title: 'A1', slug: 'a1', body: '...' });
      await service.createArticle({ categoryId: cat2.id, title: 'B1', slug: 'b1', body: '...' });
      const filtered = await service.listArticles('a');
      expect(filtered).toHaveLength(1);
    });

    it('searches articles by title', async () => {
      const cat = await service.createCategory('General', 'general');
      await service.createArticle({ categoryId: cat.id, title: 'Installation Guide', slug: 'install', body: '...', published: true });
      await service.createArticle({ categoryId: cat.id, title: 'Billing FAQ', slug: 'billing', body: '...', published: true });
      const found = await service.listArticles(undefined, 'install');
      expect(found).toHaveLength(1);
    });

    it('gets article by slug', async () => {
      const cat = await service.createCategory('General', 'general');
      await service.createArticle({ categoryId: cat.id, title: 'My Article', slug: 'my-article', body: 'Hello' });
      const article = await service.getArticle('my-article');
      expect(article.title).toBe('My Article');
    });

    it('throws on missing article', async () => {
      await expect(service.getArticle('nonexistent')).rejects.toThrow('Article not found');
    });

    it('updates and deletes', async () => {
      const cat = await service.createCategory('General', 'general');
      const art = await service.createArticle({ categoryId: cat.id, title: 'Original', slug: 'original', body: '...' });
      await service.updateArticle(art.id, { title: 'Updated' });
      await service.deleteArticle(art.id);
      await expect(service.getArticle('original')).rejects.toThrow('Article not found');
    });
  });

  describe('voting', () => {
    it('increments helpful count', async () => {
      const cat = await service.createCategory('General', 'general');
      const art = await service.createArticle({ categoryId: cat.id, title: 'Test', slug: 'test', body: '...' });
      await service.vote('test', true);
      expect(articles.get(art.id)?.helpful).toBe(1);
    });

    it('increments unhelpful count', async () => {
      const cat = await service.createCategory('General', 'general');
      const art = await service.createArticle({ categoryId: cat.id, title: 'Test', slug: 'test', body: '...' });
      await service.vote('test', false);
      expect(articles.get(art.id)?.unhelpful).toBe(1);
    });

    it('throws on voting non-existent article', async () => {
      await expect(service.vote('nope', true)).rejects.toThrow('Article not found');
    });
  });
});
