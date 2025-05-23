-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isProfileCompleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "travelInterests" TEXT[] DEFAULT ARRAY[]::TEXT[];
