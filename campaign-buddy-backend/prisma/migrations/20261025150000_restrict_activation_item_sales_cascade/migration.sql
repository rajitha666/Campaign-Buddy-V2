-- #111: deleting an ActivationItem must never silently delete recorded sales
-- or custom-field values. Replace ON DELETE CASCADE with RESTRICT.
ALTER TABLE "sales_records" DROP CONSTRAINT "sales_records_activationItemId_fkey";
ALTER TABLE "sales_records" ADD CONSTRAINT "sales_records_activationItemId_fkey" FOREIGN KEY ("activationItemId") REFERENCES "activation_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sales_field_values" DROP CONSTRAINT "sales_field_values_activationItemId_fkey";
ALTER TABLE "sales_field_values" ADD CONSTRAINT "sales_field_values_activationItemId_fkey" FOREIGN KEY ("activationItemId") REFERENCES "activation_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
