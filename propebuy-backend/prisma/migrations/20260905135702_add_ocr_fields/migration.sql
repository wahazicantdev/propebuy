-- AlterTable
ALTER TABLE "users" ADD COLUMN     "ocrConfidence" DOUBLE PRECISION,
ADD COLUMN     "ocrExtractedData" TEXT,
ADD COLUMN     "ocrIssues" TEXT,
ADD COLUMN     "ocrResult" TEXT;
