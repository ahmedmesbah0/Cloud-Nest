import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { Controller, Get } from '@nestjs/common';
import request from 'supertest';
import { PrismaClientExceptionFilter } from './prisma-client-exception.filter';

@Controller('test')
class TestController {
  @Get('p2002')
  throwP2002() {
    const err = new Error('Unique constraint failed');
    (err as any).code = 'P2002';
    throw err;
  }

  @Get('p2025')
  throwP2025() {
    const err = new Error('Record not found');
    (err as any).code = 'P2025';
    throw err;
  }

  @Get('p2003')
  throwP2003() {
    const err = new Error('Foreign key violation');
    (err as any).code = 'P2003';
    throw err;
  }

  @Get('unknown')
  throwUnknown() {
    throw new Error('Generic error');
  }

  @Get('non-prisma')
  throwNonPrisma() {
    const err = new Error('Some other error');
    (err as any).code = 'NOT_PRISMA';
    throw err;
  }
}

describe('PrismaClientExceptionFilter', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TestController],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalFilters(new PrismaClientExceptionFilter(app.getHttpAdapter()));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 409 for P2002 unique constraint violations', async () => {
    const res = await request(app.getHttpServer()).get('/test/p2002');
    expect(res.status).toBe(409);
    expect(res.body.prismaCode).toBe('P2002');
    expect(res.body.error).toBe('Unique constraint violation');
  });

  it('returns 404 for P2025 record not found', async () => {
    const res = await request(app.getHttpServer()).get('/test/p2025');
    expect(res.status).toBe(404);
    expect(res.body.prismaCode).toBe('P2025');
  });

  it('returns 400 for P2003 foreign key violation', async () => {
    const res = await request(app.getHttpServer()).get('/test/p2003');
    expect(res.status).toBe(400);
    expect(res.body.prismaCode).toBe('P2003');
  });

  it('passes non-Prisma errors to the default handler', async () => {
    const res = await request(app.getHttpServer()).get('/test/unknown');
    expect(res.status).toBe(500);
  });

  it('passes non-P-code errors to the default handler', async () => {
    const res = await request(app.getHttpServer()).get('/test/non-prisma');
    expect(res.status).toBe(500);
  });
});
