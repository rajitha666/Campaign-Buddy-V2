-- #111: removing a product from a campaign / activation is reversible.
ALTER TABLE "campaign_items" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "activation_items" ADD COLUMN "deletedAt" TIMESTAMP(3);
