import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { AuthRepository } from '../auth/auth.repository';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly authRepository: AuthRepository) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId = request.user?.id;

    if (!userId) {
      throw new ForbiddenException('Not authenticated');
    }

    const userRole = await this.authRepository.findAdminRole(userId);

    if (!userRole) {
      throw new ForbiddenException('Admin access required');
    }

    return true;
  }
}
