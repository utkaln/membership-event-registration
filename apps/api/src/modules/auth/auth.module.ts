import { Module, forwardRef } from '@nestjs/common';
import { SupabaseService } from './supabase.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [forwardRef(() => UsersModule)],
  providers: [SupabaseService, JwtAuthGuard, RolesGuard],
  exports: [SupabaseService, JwtAuthGuard, RolesGuard],
})
export class AuthModule {}
