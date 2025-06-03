/*
  Warnings:

  - You are about to drop the column `category` on the `MissionTemplate` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "MissionTemplate" DROP COLUMN "category",
ADD COLUMN     "location" TEXT;
