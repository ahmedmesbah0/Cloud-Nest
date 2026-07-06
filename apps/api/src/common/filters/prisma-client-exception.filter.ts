import { Catch, ArgumentsHost, Logger } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';

const PRISMA_ERROR_CODES: Record<string, { status: number; message: string }> = {
  P2000: { status: 400, message: 'Input value is too long for the column' },
  P2001: { status: 404, message: 'Record does not exist' },
  P2002: { status: 409, message: 'Unique constraint violation' },
  P2003: { status: 400, message: 'Foreign key constraint violation' },
  P2004: { status: 400, message: 'Constraint violation' },
  P2005: { status: 400, message: 'Invalid value for field type' },
  P2006: { status: 400, message: 'Invalid value for the field' },
  P2007: { status: 400, message: 'Validation error' },
  P2008: { status: 400, message: 'Query parsing error' },
  P2009: { status: 400, message: 'Query validation error' },
  P2010: { status: 500, message: 'Raw query failed' },
  P2011: { status: 400, message: 'Null constraint violation' },
  P2012: { status: 400, message: 'Missing required value' },
  P2013: { status: 400, message: 'Missing required argument' },
  P2014: { status: 400, message: 'Required relation violation' },
  P2015: { status: 404, message: 'Related record not found' },
  P2016: { status: 400, message: 'Query interpretation error' },
  P2017: { status: 400, message: 'Relation between records not found' },
  P2018: { status: 404, message: 'Required connected records not found' },
  P2019: { status: 400, message: 'Input error' },
  P2020: { status: 400, message: 'Value out of range' },
  P2021: { status: 404, message: 'Table not found' },
  P2022: { status: 404, message: 'Column not found' },
  P2023: { status: 400, message: 'Inconsistent column data' },
  P2024: { status: 503, message: 'Connection pool timeout' },
  P2025: { status: 404, message: 'Record not found' },
  P2026: { status: 400, message: 'Unsupported provider feature' },
  P2027: { status: 500, message: 'Multiple errors occurred' },
  P2028: { status: 500, message: 'Transaction API error' },
  P2030: { status: 400, message: 'Full-text search index not found' },
  P2031: { status: 500, message: 'Transaction commit failed due to MongoDB' },
  P2033: { status: 400, message: 'Number out of range' },
  P2034: { status: 409, message: 'Transaction conflict — rollback and retry' },
};

@Catch()
export class PrismaClientExceptionFilter extends BaseExceptionFilter {
  private readonly logger = new Logger(PrismaClientExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const err = exception as Record<string, unknown>;
    if (err?.code && typeof err.code === 'string' && err.code.startsWith('P')) {
      const mapping = PRISMA_ERROR_CODES[err.code];
      if (mapping) {
        this.logger.warn(`Prisma error ${err.code}: ${err.message ?? mapping.message}`);
        const ctx = host.switchToHttp();
        const response = ctx.getResponse();
        response.status(mapping.status).json({
          statusCode: mapping.status,
          error: mapping.message,
          prismaCode: err.code,
        });
        return;
      }
    }

    super.catch(exception, host);
  }
}
