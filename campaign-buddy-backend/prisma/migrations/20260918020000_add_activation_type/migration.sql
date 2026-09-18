-- Activation Type (client doc B) — admin picks "weekend" or "monthly" per
-- activation. Drives day-counting (weekend = Sat/Sun only, monthly = Mon-Fri)
-- and target proration (÷8 working weekend days/month, ÷25 working days/month)
-- for the Overall Performance calc. Existing activations default to "monthly",
-- matching their current (undivided, calendar-day) behaviour.
CREATE TYPE "ActivationType" AS ENUM ('weekend', 'monthly');

ALTER TABLE "activations" ADD COLUMN "activationType" "ActivationType" NOT NULL DEFAULT 'monthly';
