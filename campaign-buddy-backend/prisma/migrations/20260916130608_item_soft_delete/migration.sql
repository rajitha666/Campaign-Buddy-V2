-- AlterTable
ALTER TABLE "items" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- DropIndex: replace the brandId+sku unique index with a partial one so a
-- soft-deleted item's sku can be reused for a new item on the same brand
DROP INDEX "items_brandId_sku_key";

-- CreateIndex partial on non-deleted rows only
CREATE UNIQUE INDEX "items_brandId_sku_key" ON "items"("brandId", "sku") WHERE "deletedAt" IS NULL;
