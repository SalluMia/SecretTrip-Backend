/*
  Warnings:

  - The `status` column on the `Trip` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Added the required column `type` to the `MissionTemplate` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'BLOCKED');

-- CreateEnum
CREATE TYPE "TripStatus" AS ENUM ('UPCOMING', 'ACTIVE', 'COMPLETED');

-- CreateEnum
CREATE TYPE "MissionType" AS ENUM ('AESTHETIC', 'SECRET_AGENT');

-- CreateEnum
CREATE TYPE "MissionLevel" AS ENUM ('NORMAL', 'CRITICAL');

-- AlterTable
ALTER TABLE "MissionTemplate" ADD COLUMN     "level" "MissionLevel" NOT NULL DEFAULT 'NORMAL',
ADD COLUMN     "type" "MissionType" NOT NULL;

-- AlterTable
ALTER TABLE "Trip" DROP COLUMN "status",
ADD COLUMN     "status" "TripStatus" NOT NULL DEFAULT 'UPCOMING';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE';
