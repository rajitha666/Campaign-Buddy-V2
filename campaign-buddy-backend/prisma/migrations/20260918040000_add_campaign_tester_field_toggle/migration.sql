-- Tester count toggle (client doc D) — off by default for every existing
-- campaign; turning it on auto-provisions a standard "Tester" custom field.
ALTER TABLE "campaigns" ADD COLUMN "testerFieldEnabled" BOOLEAN NOT NULL DEFAULT false;
