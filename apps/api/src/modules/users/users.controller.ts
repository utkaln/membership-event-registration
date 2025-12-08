import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateProfileDto, UpdateProfileDto, UserResponseDto } from './dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * Get current user profile
   * GET /api/users/me
   */
  @Get('me')
  async getCurrentUser(@CurrentUser() user: any): Promise<UserResponseDto> {
    return this.usersService.findById(user.id) as Promise<UserResponseDto>;
  }

  /**
   * Create or update current user's profile
   * POST /api/users/me/profile
   */
  @Post('me/profile')
  async createOrUpdateMyProfile(
    @CurrentUser() user: any,
    @Body() dto: CreateProfileDto,
  ): Promise<UserResponseDto> {
    return this.usersService.createOrUpdateProfile(user.id, dto);
  }

  /**
   * Update current user's profile
   * PUT /api/users/me/profile
   */
  @Put('me/profile')
  async updateMyProfile(
    @CurrentUser() user: any,
    @Body() dto: UpdateProfileDto,
  ): Promise<UserResponseDto> {
    return this.usersService.updateProfile(user.id, dto);
  }

  /**
   * Export current user's data (GDPR)
   * GET /api/users/me/export
   */
  @Get('me/export')
  async exportMyData(@CurrentUser() user: any): Promise<any> {
    return this.usersService.exportUserData(user.id);
  }

  /**
   * Soft delete current user's account (GDPR)
   * DELETE /api/users/me
   */
  @Delete('me')
  @HttpCode(HttpStatus.OK)
  async deleteMyAccount(@CurrentUser() user: any): Promise<{ message: string }> {
    return this.usersService.softDeleteUser(user.id);
  }

  /**
   * Get all users (admin only)
   * GET /api/users?skip=0&take=10&role=MEMBER
   */
  @Get()
  @Roles(UserRole.ADMIN)
  async getAllUsers(
    @Query('skip') skip?: string,
    @Query('take') take?: string,
    @Query('role') role?: UserRole,
    @Query('includeDeleted') includeDeleted?: string,
  ): Promise<{ users: UserResponseDto[]; total: number }> {
    return this.usersService.findAll({
      skip: skip ? parseInt(skip, 10) : 0,
      take: take ? parseInt(take, 10) : 10,
      role,
      includeDeleted: includeDeleted === 'true',
    });
  }

  /**
   * Get user by ID (admin only)
   * GET /api/users/:id
   */
  @Get(':id')
  @Roles(UserRole.ADMIN)
  async getUserById(@Param('id') id: string): Promise<UserResponseDto> {
    const user = await this.usersService.findById(id);
    if (!user) {
      throw new Error('User not found');
    }
    return user;
  }

  /**
   * Update user role (admin only)
   * PUT /api/users/:id/role
   */
  @Put(':id/role')
  @Roles(UserRole.ADMIN)
  async updateUserRole(
    @Param('id') id: string,
    @Body('role') role: UserRole,
  ): Promise<UserResponseDto> {
    return this.usersService.updateRole(id, role);
  }

  /**
   * Export user data by ID (admin only)
   * GET /api/users/:id/export
   */
  @Get(':id/export')
  @Roles(UserRole.ADMIN)
  async exportUserData(@Param('id') id: string): Promise<any> {
    return this.usersService.exportUserData(id);
  }

  /**
   * Soft delete user by ID (admin only)
   * DELETE /api/users/:id
   */
  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  async deleteUser(@Param('id') id: string): Promise<{ message: string }> {
    return this.usersService.softDeleteUser(id);
  }
}
