-- AlterEnum
ALTER TYPE "MembershipStatus" ADD VALUE 'UPGRADED';

-- DropIndex
DROP INDEX "memberships_userId_key";

-- AlterTable
ALTER TABLE "memberships" ADD COLUMN "upgradedFromId" TEXT,
ADD COLUMN "upgradedToId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "memberships_upgradedFromId_key" ON "memberships"("upgradedFromId");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_upgradedToId_key" ON "memberships"("upgradedToId");

-- CreateIndex
CREATE INDEX "memberships_userId_idx" ON "memberships"("userId");

-- CreateIndex
CREATE INDEX "memberships_userId_status_idx" ON "memberships"("userId", "status");

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_upgradedFromId_fkey" FOREIGN KEY ("upgradedFromId") REFERENCES "memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;
