-- AlterTable
ALTER TABLE "activation_targets" ADD COLUMN     "targetBrandId" TEXT,
ALTER COLUMN "targetItemId" DROP NOT NULL;
