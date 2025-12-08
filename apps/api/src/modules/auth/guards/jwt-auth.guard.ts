import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase.service';
import { UsersService } from '../../users/users.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private supabaseService: SupabaseService,
    private usersService: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('No authentication token provided');
    }

    // Validate JWT with Supabase
    const authUser = await this.supabaseService.verifyToken(token);

    if (!authUser) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    // JIT Sync: Ensure user exists in our database
    let dbUser = await this.usersService.findById(authUser.id);

    if (!dbUser) {
      // Create user on first API access
      dbUser = await this.usersService.create({
        id: authUser.id,
        email: authUser.email!,
        role: 'GUEST',
      });

      console.log(`✅ JIT Sync: Created new user ${authUser.email}`);
    }

    // Check if user is soft-deleted
    if (dbUser.deletedAt) {
      throw new UnauthorizedException('User account has been deleted');
    }

    // Attach user to request for use in controllers
    request.user = dbUser;

    return true;
  }

  private extractToken(request: any): string | null {
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      return null;
    }

    const [type, token] = authHeader.split(' ');

    if (type !== 'Bearer' || !token) {
      return null;
    }

    return token;
  }
}
