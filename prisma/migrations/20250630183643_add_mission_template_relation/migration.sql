-- AlterTable
ALTER TABLE "AssignedMission" ADD COLUMN     "missionTemplateId" TEXT;

-- AddForeignKey
ALTER TABLE "AssignedMission" ADD CONSTRAINT "AssignedMission_missionTemplateId_fkey" FOREIGN KEY ("missionTemplateId") REFERENCES "MissionTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
