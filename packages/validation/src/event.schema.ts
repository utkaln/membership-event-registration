import { z } from 'zod';

export const createEventSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().optional(),
  location: z.string().max(500).optional(),
  maxAttendees: z.number().int().positive().optional(),
  categoryId: z.string().uuid(),
});

export const updateEventSchema = createEventSchema.partial();

export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;
