import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { MembershipsService } from './memberships.service';
import {
  CreateMembershipDto,
  MembershipResponseDto,
  ApproveMembershipDto,
  UpdateMembershipStatusDto,
  AssignHonoraryMembershipDto,
} from './dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole, MembershipStatus } from '@prisma/client';

@Controller('memberships')
export class MembershipsController {
  constructor(private readonly membershipsService: MembershipsService) {}

  /**
   * Get all available membership types (public endpoint)
   * GET /api/memberships/types
   */
  @Get('types')
  async getMembershipTypes() {
    return this.membershipsService.getMembershipTypes();
  }

  /**
   * Apply for a new membership
   * POST /api/memberships
   */
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  async create(
    @CurrentUser() user: any,
    @Body() dto: CreateMembershipDto,
  ): Promise<MembershipResponseDto> {
    return this.membershipsService.create(user.id, dto);
  }

  /**
   * Get current user's membership
   * GET /api/memberships/me
   */
  @Get('me')
  @UseGuards(JwtAuthGuard, RolesGuard)
  async getMyMembership(@CurrentUser() user: any): Promise<MembershipResponseDto | null> {
    return this.membershipsService.findMyMembership(user.id);
  }

  /**
   * Get current user's membership history
   * GET /api/memberships/me/history
   */
  @Get('me/history')
  @UseGuards(JwtAuthGuard, RolesGuard)
  async getMyMembershipHistory(@CurrentUser() user: any): Promise<MembershipResponseDto[]> {
    return this.membershipsService.getMembershipHistory(user.id);
  }

  /**
   * Cancel current user's membership
   * DELETE /api/memberships/me
   */
  @Delete('me')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @HttpCode(HttpStatus.OK)
  async cancelMyMembership(@CurrentUser() user: any): Promise<MembershipResponseDto> {
    const membership = await this.membershipsService.findMyMembership(user.id);
    if (!membership) {
      throw new Error('No active membership found');
    }
    return this.membershipsService.cancel(membership.id, user.id);
  }

  /**
   * Get all memberships (admin only)
   * GET /api/memberships?skip=0&take=10&status=PENDING
   */
  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async getAllMemberships(
    @Query('skip') skip?: string,
    @Query('take') take?: string,
    @Query('status') status?: MembershipStatus,
  ): Promise<{ memberships: MembershipResponseDto[]; total: number }> {
    return this.membershipsService.findAll({
      skip: skip ? parseInt(skip, 10) : 0,
      take: take ? parseInt(take, 10) : 10,
      status,
    });
  }

  /**
   * Get membership by ID (admin only)
   * GET /api/memberships/:id
   */
  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async getMembershipById(@Param('id') id: string): Promise<MembershipResponseDto> {
    return this.membershipsService.findOne(id);
  }

  /**
   * Approve a pending membership (admin only)
   * POST /api/memberships/:id/approve
   */
  @Post(':id/approve')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async approveMembership(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() dto: ApproveMembershipDto,
  ): Promise<MembershipResponseDto> {
    return this.membershipsService.approve(id, user.id, dto);
  }

  /**
   * Reject a pending membership (admin only)
   * POST /api/memberships/:id/reject
   */
  @Post(':id/reject')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async rejectMembership(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body('reason') reason: string,
  ): Promise<MembershipResponseDto> {
    return this.membershipsService.reject(id, user.id, reason);
  }

  /**
   * Assign honorary membership (admin only)
   * POST /api/memberships/honorary/assign
   */
  @Post('honorary/assign')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async assignHonoraryMembership(
    @CurrentUser() admin: any,
    @Body() dto: AssignHonoraryMembershipDto,
  ): Promise<MembershipResponseDto> {
    return this.membershipsService.assignHonoraryMembership(
      dto.userId,
      admin.id,
      dto.note,
    );
  }

  /**
   * Update membership status (admin only)
   * PUT /api/memberships/:id/status
   */
  @Put(':id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async updateMembershipStatus(
    @Param('id') id: string,
    @Body() dto: UpdateMembershipStatusDto,
  ): Promise<MembershipResponseDto> {
    return this.membershipsService.updateStatus(id, dto.status, dto.note);
  }

  /**
   * Cancel a membership by ID (admin only)
   * DELETE /api/memberships/:id
   */
  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  async cancelMembership(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ): Promise<MembershipResponseDto> {
    const membership = await this.membershipsService.findOne(id);
    return this.membershipsService.cancel(id, membership.userId);
  }
}
