import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId = request.user?.id;

    if (!userId) {
      throw new ForbiddenException('Not authenticated');
    }

    const userRole = await this.prisma.userRole.findFirst({
      where: {
        userId,
        role: { name: 'admin' },
      },
    });

    if (!userRole) {
      throw new ForbiddenException('Admin access required');
    }

    return true;
  }
}
