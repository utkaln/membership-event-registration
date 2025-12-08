-- Add credit tracking fields to memberships table
-- Allows tracking credit from expired memberships applied to new memberships

-- AlterTable
ALTER TABLE "memberships" ADD COLUMN "creditAppliedFromId" TEXT,
ADD COLUMN "creditAmount" DECIMAL(10,2);

-- CreateIndex
CREATE UNIQUE INDEX "memberships_creditAppliedFromId_key" ON "memberships"("creditAppliedFromId");

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_creditAppliedFromId_fkey" FOREIGN KEY ("creditAppliedFromId") REFERENCES "memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;
