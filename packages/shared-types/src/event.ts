export interface Event {
  id: string;
  title: string;
  slug: string;
  description: string;
  startDate: Date;
  endDate?: Date | null;
  location?: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
