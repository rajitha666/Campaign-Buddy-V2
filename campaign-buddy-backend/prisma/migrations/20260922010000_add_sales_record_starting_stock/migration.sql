-- Starting-stock snapshot (#91): the opening stock the promoter entered on the
-- first stock update after checking in. NULL for every row that existed before
-- this change (no historical backfill) and for days with no stock update.
ALTER TABLE "sales_records" ADD COLUMN "startingStock" INTEGER;
