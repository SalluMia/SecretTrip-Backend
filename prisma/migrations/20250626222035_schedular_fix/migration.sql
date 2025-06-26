-- AlterTable
ALTER TABLE "AssignedMission" ADD COLUMN     "caption" TEXT,
ADD COLUMN     "dayAssigned" INTEGER,
ADD COLUMN     "thumbnailUrl" TEXT;

-- CreateIndex
CREATE INDEX "AssignedMission_dayAssigned_idx" ON "AssignedMission"("dayAssigned");
