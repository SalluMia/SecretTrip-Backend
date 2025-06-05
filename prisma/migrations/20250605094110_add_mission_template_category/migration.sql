/*
  Warnings:

  - You are about to drop the column `type` on the `MissionTemplate` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "MissionTemplate" DROP COLUMN "type",
ADD COLUMN     "category" "MissionType";
