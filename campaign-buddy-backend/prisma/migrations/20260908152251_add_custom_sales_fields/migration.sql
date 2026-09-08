-- CreateEnum
CREATE TYPE "SalesFieldType" AS ENUM ('number', 'text', 'boolean', 'select');

-- CreateEnum
CREATE TYPE "SalesFieldScope" AS ENUM ('day', 'product');

-- CreateTable
CREATE TABLE "sales_field_definitions" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "SalesFieldType" NOT NULL,
    "scope" "SalesFieldScope" NOT NULL DEFAULT 'day',
    "options" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "required" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_field_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_field_values" (
    "id" TEXT NOT NULL,
    "definitionId" TEXT NOT NULL,
    "activationId" TEXT NOT NULL,
    "activationItemId" TEXT,
    "date" DATE NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_field_values_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sales_field_definitions_campaignId_idx" ON "sales_field_definitions"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "sales_field_definitions_campaignId_key_key" ON "sales_field_definitions"("campaignId", "key");

-- CreateIndex
CREATE INDEX "sales_field_values_activationId_date_idx" ON "sales_field_values"("activationId", "date");

-- CreateIndex
CREATE INDEX "sales_field_values_definitionId_idx" ON "sales_field_values"("definitionId");

-- Partial unique indexes: one value per (definition, day) for day-scope rows
-- (activationItemId IS NULL) and one per (definition, product, day) for
-- product-scope rows. Prisma's schema can't express partial indexes, so they
-- live here — see docs/custom-sales-fields-spec.md.
CREATE UNIQUE INDEX "sales_field_values_day_uq"
  ON "sales_field_values" ("definitionId", "activationId", "date")
  WHERE "activationItemId" IS NULL;

CREATE UNIQUE INDEX "sales_field_values_product_uq"
  ON "sales_field_values" ("definitionId", "activationItemId", "date")
  WHERE "activationItemId" IS NOT NULL;

-- AddForeignKey
ALTER TABLE "sales_field_definitions" ADD CONSTRAINT "sales_field_definitions_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_field_values" ADD CONSTRAINT "sales_field_values_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "sales_field_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_field_values" ADD CONSTRAINT "sales_field_values_activationId_fkey" FOREIGN KEY ("activationId") REFERENCES "activations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_field_values" ADD CONSTRAINT "sales_field_values_activationItemId_fkey" FOREIGN KEY ("activationItemId") REFERENCES "activation_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
