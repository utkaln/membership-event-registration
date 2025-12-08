import { z } from 'zod';

export const createMembershipTypeSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  price: z.number().nonnegative(),
  durationMonths: z.number().int().positive(),
});

export const updateMembershipTypeSchema = createMembershipTypeSchema.partial();

export type CreateMembershipTypeInput = z.infer<typeof createMembershipTypeSchema>;
export type UpdateMembershipTypeInput = z.infer<typeof updateMembershipTypeSchema>;
