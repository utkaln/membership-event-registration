import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateProfileDto, UpdateProfileDto, UserResponseDto } from './dto';
import { UserRole, Prisma } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  /**
   * Find user by ID (including soft-deleted)
   */
  async findById(id: string, includeDeleted = false): Promise<UserResponseDto | null> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        profile: true,
        memberships: {
          where: {
            status: {
              in: ['ACTIVE', 'PENDING'],
            },
          },
          include: {
            membershipType: true,
          },
          take: 1,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!user) {
      return null;
    }

    // Check if user is soft-deleted
    if (!includeDeleted && user.deletedAt) {
      return null;
    }

    return user as UserResponseDto;
  }

  /**
   * Find user by email
   */
  async findByEmail(email: string): Promise<UserResponseDto | null> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        profile: true,
      },
    });

    // Exclude soft-deleted users
    if (user && user.deletedAt) {
      return null;
    }

    return user as UserResponseDto;
  }

  /**
   * Create a new user (called by JIT Sync or admin)
   */
  async create(data: {
    id: string;
    email: string;
    role?: UserRole;
  }): Promise<UserResponseDto> {
    const existingUser = await this.prisma.user.findUnique({
      where: { id: data.id },
    });

    if (existingUser && !existingUser.deletedAt) {
      throw new ConflictException('User already exists');
    }

    const user = await this.prisma.user.create({
      data: {
        id: data.id,
        email: data.email,
        role: data.role || 'GUEST',
      },
      include: {
        profile: true,
      },
    });

    return user as UserResponseDto;
  }

  /**
   * Create or update user profile
   */
  async createOrUpdateProfile(
    userId: string,
    dto: CreateProfileDto,
  ): Promise<UserResponseDto> {
    // Verify user exists and is not deleted
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check if profile already exists
    const existingProfile = await this.prisma.profile.findUnique({
      where: { userId },
    });

    // Transform flat address fields to address object if needed
    let addressData: any;
    if (dto.address) {
      // Use provided address object
      addressData = dto.address;
    } else if (dto.addressLine1 || dto.city || dto.state || dto.zipCode) {
      // Construct address from flat fields
      addressData = {
        street: dto.addressLine1 || '',
        city: dto.city || '',
        state: dto.state || '',
        zip: dto.zipCode || '',
        country: dto.country || 'USA',
      };

      // Add addressLine2 if provided
      if (dto.addressLine2) {
        addressData.street = `${addressData.street}, ${dto.addressLine2}`;
      }
    }

    const profileData: Prisma.ProfileCreateInput | Prisma.ProfileUpdateInput = {
      firstName: dto.firstName,
      lastName: dto.lastName,
      spouseName: dto.spouseName,
      address: addressData as any,
      children: dto.children as any,
      phone: dto.phone,
      bio: dto.bio,
    };

    if (existingProfile) {
      // Update existing profile
      await this.prisma.profile.update({
        where: { userId },
        data: profileData,
      });
    } else {
      // Create new profile
      await this.prisma.profile.create({
        data: {
          ...profileData,
          user: {
            connect: { id: userId },
          },
        } as Prisma.ProfileCreateInput,
      });
    }

    // Return updated user with profile
    return this.findById(userId) as Promise<UserResponseDto>;
  }

  /**
   * Update user profile
   */
  async updateProfile(
    userId: string,
    dto: UpdateProfileDto,
  ): Promise<UserResponseDto> {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.profile) {
      throw new NotFoundException('Profile not found. Create profile first.');
    }

    await this.prisma.profile.update({
      where: { userId },
      data: {
        ...(dto.firstName && { firstName: dto.firstName }),
        ...(dto.lastName && { lastName: dto.lastName }),
        ...(dto.spouseName !== undefined && { spouseName: dto.spouseName }),
        ...(dto.address && { address: dto.address as any }),
        ...(dto.children !== undefined && { children: dto.children as any }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
        ...(dto.bio !== undefined && { bio: dto.bio }),
      },
    });

    return this.findById(userId) as Promise<UserResponseDto>;
  }

  /**
   * Update user role (admin only)
   */
  async updateRole(userId: string, role: UserRole): Promise<UserResponseDto> {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { role },
    });

    return this.findById(userId) as Promise<UserResponseDto>;
  }

  /**
   * GDPR: Export all user data
   */
  async exportUserData(userId: string): Promise<any> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
        memberships: {
          include: {
            membershipType: true,
          },
        },
        eventRegistrations: {
          include: {
            event: true,
          },
        },
        waitlistEntries: {
          include: {
            event: true,
          },
        },
        payments: true,
        authoredArticles: true,
        createdEvents: true,
        createdPages: true,
        uploadedMedia: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Return all user data in portable format
    return {
      exportDate: new Date().toISOString(),
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
      },
      profile: user.profile,
      memberships: user.memberships,
      eventRegistrations: user.eventRegistrations,
      waitlistEntries: user.waitlistEntries,
      payments: user.payments,
      authoredArticles: user.authoredArticles,
      createdEvents: user.createdEvents,
      createdPages: user.createdPages,
      uploadedMedia: user.uploadedMedia,
    };
  }

  /**
   * GDPR: Soft delete user account
   */
  async softDeleteUser(userId: string): Promise<{ message: string }> {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.deletedAt) {
      throw new BadRequestException('User already deleted');
    }

    // Soft delete by setting deletedAt
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        deletedAt: new Date(),
      },
    });

    return { message: 'User account soft deleted successfully' };
  }

  /**
   * List all users (admin only, with pagination)
   */
  async findAll(params: {
    skip?: number;
    take?: number;
    role?: UserRole;
    includeDeleted?: boolean;
  }): Promise<{ users: UserResponseDto[]; total: number }> {
    const { skip = 0, take = 10, role, includeDeleted = false } = params;

    const where: Prisma.UserWhereInput = {
      ...(role && { role }),
      ...(!includeDeleted && { deletedAt: null }),
    };

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        include: {
          profile: true,
          memberships: {
            where: {
              status: {
                in: ['ACTIVE', 'PENDING'],
              },
            },
            include: {
              membershipType: true,
            },
            take: 1,
            orderBy: { createdAt: 'desc' },
          },
        },
        skip,
        take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      users: users as UserResponseDto[],
      total,
    };
  }
}
