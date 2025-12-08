// OSA Community Platform - Database Seeding Script
// This script seeds the database with initial data as specified in prompts/02_DATABASE_SCHEMA.md

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding...\n');

  // ============================================================================
  // EVENT CATEGORIES
  // ============================================================================
  console.log('📁 Seeding Event Categories...');

  const categories = [
    {
      name: 'Education',
      slug: 'education',
      color: '#3B82F6',
      icon: 'GraduationCap',
      sortOrder: 1,
    },
    {
      name: 'Cultural',
      slug: 'cultural',
      color: '#F59E0B',
      icon: 'Music',
      sortOrder: 2,
    },
    {
      name: 'Professional Networking',
      slug: 'professional-networking',
      color: '#6366F1',
      icon: 'Briefcase',
      sortOrder: 3,
    },
    {
      name: 'Health & Wellness',
      slug: 'health-wellness',
      color: '#10B981',
      icon: 'Heart',
      sortOrder: 4,
    },
    {
      name: 'Womens',
      slug: 'womens',
      color: '#EC4899',
      icon: 'Users',
      sortOrder: 5,
    },
    {
      name: 'Youths',
      slug: 'youths',
      color: '#8B5CF6',
      icon: 'Sparkles',
      sortOrder: 6,
    },
    {
      name: 'Skill Development',
      slug: 'skill-development',
      color: '#F97316',
      icon: 'Wrench',
      sortOrder: 7,
    },
    {
      name: 'Spiritual',
      slug: 'spiritual',
      color: '#14B8A6',
      icon: 'Sun',
      sortOrder: 8,
    },
    {
      name: 'Humanitarian',
      slug: 'humanitarian',
      color: '#EF4444',
      icon: 'HandHeart',
      sortOrder: 9,
    },
    {
      name: 'Odisha Development',
      slug: 'odisha-development',
      color: '#84CC16',
      icon: 'Building',
      sortOrder: 10,
    },
  ];

  for (const category of categories) {
    await prisma.eventCategory.upsert({
      where: { slug: category.slug },
      update: category,
      create: category,
    });
  }

  console.log('✅ Event categories seeded\n');

  // ============================================================================
  // MEMBERSHIP TYPES
  // ============================================================================
  console.log('💳 Seeding Membership Types...');

  const membershipTypes = [
    {
      name: 'Individual',
      slug: 'individual',
      description: 'Individual membership for one person',
      price: 50.0,
      benefits: ['Event registration', 'Newsletter subscription', 'Voting rights'],
      durationMonths: 12,
      sortOrder: 1,
    },
    {
      name: 'Family',
      slug: 'family',
      description: 'Family membership for household',
      price: 75.0,
      benefits: [
        'All Individual benefits',
        'Family event discounts',
        'Multiple family members',
      ],
      durationMonths: 12,
      sortOrder: 2,
    },
    {
      name: 'Student',
      slug: 'student',
      description: 'Discounted membership for students',
      price: 25.0,
      benefits: ['Event registration', 'Newsletter subscription'],
      durationMonths: 12,
      sortOrder: 3,
    },
    {
      name: 'Lifetime',
      slug: 'lifetime',
      description: 'One-time payment for lifetime membership',
      price: 500.0,
      benefits: ['All Family benefits', 'Lifetime access', 'VIP event access'],
      durationMonths: null, // Lifetime
      sortOrder: 4,
    },
  ];

  for (const type of membershipTypes) {
    await prisma.membershipType.upsert({
      where: { slug: type.slug },
      update: type,
      create: type,
    });
  }

  console.log('✅ Membership types seeded\n');

  // ============================================================================
  // SUMMARY
  // ============================================================================
  const categoryCount = await prisma.eventCategory.count();
  const membershipTypeCount = await prisma.membershipType.count();

  console.log('🎉 Database seeding completed successfully!\n');
  console.log('📊 Summary:');
  console.log(`   - Event Categories: ${categoryCount}`);
  console.log(`   - Membership Types: ${membershipTypeCount}`);
  console.log('');
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:');
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
