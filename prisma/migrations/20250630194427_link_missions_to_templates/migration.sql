/*
  Warnings:

  - You are about to drop the column `category` on the `AssignedMission` table. All the data in the column will be lost.
  - You are about to drop the column `instruction` on the `AssignedMission` table. All the data in the column will be lost.
  - You are about to drop the column `sampleImageUrl` on the `AssignedMission` table. All the data in the column will be lost.
  - You are about to drop the column `title` on the `AssignedMission` table. All the data in the column will be lost.
  - Made the column `missionTemplateId` on table `AssignedMission` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "AssignedMission" DROP CONSTRAINT "AssignedMission_missionTemplateId_fkey";

-- AlterTable
ALTER TABLE "AssignedMission" DROP COLUMN "category",
DROP COLUMN "instruction",
DROP COLUMN "sampleImageUrl",
DROP COLUMN "title",
ALTER COLUMN "missionTemplateId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "AssignedMission_missionTemplateId_idx" ON "AssignedMission"("missionTemplateId");

-- AddForeignKey
ALTER TABLE "AssignedMission" ADD CONSTRAINT "AssignedMission_missionTemplateId_fkey" FOREIGN KEY ("missionTemplateId") REFERENCES "MissionTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
