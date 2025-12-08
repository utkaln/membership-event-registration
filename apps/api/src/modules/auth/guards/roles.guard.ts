import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      // No roles required, allow access
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    const hasRole = this.checkRole(user.role, requiredRoles);

    if (!hasRole) {
      throw new ForbiddenException(
        `User role '${user.role}' does not have permission to access this resource`,
      );
    }

    return true;
  }

  /**
   * Check if user role meets the required role level
   * Role hierarchy: ADMIN > CONTRIBUTOR > MEMBER > GUEST
   */
  private checkRole(userRole: UserRole, requiredRoles: UserRole[]): boolean {
    const roleHierarchy: Record<UserRole, number> = {
      ADMIN: 4,
      CONTRIBUTOR: 3,
      MEMBER: 2,
      GUEST: 1,
    };

    const userRoleLevel = roleHierarchy[userRole];

    // Check if user's role level meets any of the required roles
    return requiredRoles.some((role) => {
      const requiredRoleLevel = roleHierarchy[role];
      return userRoleLevel >= requiredRoleLevel;
    });
  }
}
