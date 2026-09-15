-- #22: canonical phone format is now the local Sri Lankan form ("0771234567"),
-- not E.164. Backfill every phone-ish column to that form, then make
-- staff.phone unique among ACTIVE staff (a partial index — inactive/
-- soft-deleted staff, see #23, may keep an old number a new hire reuses).
--
-- Backfill logic mirrors src/utils/phone.ts normalizeLkPhone(): strip
-- non-digits, then re-derive the local form from whichever recognized
-- Sri Lankan pattern matches. A value that matches none of them (garbage,
-- or a foreign number) is left untouched.

UPDATE "staff" SET "phone" = CASE
    WHEN regexp_replace("phone", '\D', '', 'g') ~ '^94\d{9}$' THEN '0' || substring(regexp_replace("phone", '\D', '', 'g') from 3)
    WHEN regexp_replace("phone", '\D', '', 'g') ~ '^0\d{9}$' THEN regexp_replace("phone", '\D', '', 'g')
    WHEN regexp_replace("phone", '\D', '', 'g') ~ '^7\d{8}$' THEN '0' || regexp_replace("phone", '\D', '', 'g')
    ELSE "phone"
  END
WHERE "phone" IS NOT NULL;

UPDATE "staff" SET "emergencyContactPhone" = CASE
    WHEN regexp_replace("emergencyContactPhone", '\D', '', 'g') ~ '^94\d{9}$' THEN '0' || substring(regexp_replace("emergencyContactPhone", '\D', '', 'g') from 3)
    WHEN regexp_replace("emergencyContactPhone", '\D', '', 'g') ~ '^0\d{9}$' THEN regexp_replace("emergencyContactPhone", '\D', '', 'g')
    WHEN regexp_replace("emergencyContactPhone", '\D', '', 'g') ~ '^7\d{8}$' THEN '0' || regexp_replace("emergencyContactPhone", '\D', '', 'g')
    ELSE "emergencyContactPhone"
  END
WHERE "emergencyContactPhone" IS NOT NULL;

UPDATE "outlets" SET "phone" = CASE
    WHEN regexp_replace("phone", '\D', '', 'g') ~ '^94\d{9}$' THEN '0' || substring(regexp_replace("phone", '\D', '', 'g') from 3)
    WHEN regexp_replace("phone", '\D', '', 'g') ~ '^0\d{9}$' THEN regexp_replace("phone", '\D', '', 'g')
    WHEN regexp_replace("phone", '\D', '', 'g') ~ '^7\d{8}$' THEN '0' || regexp_replace("phone", '\D', '', 'g')
    ELSE "phone"
  END
WHERE "phone" IS NOT NULL;

UPDATE "outlets" SET "mobile" = CASE
    WHEN regexp_replace("mobile", '\D', '', 'g') ~ '^94\d{9}$' THEN '0' || substring(regexp_replace("mobile", '\D', '', 'g') from 3)
    WHEN regexp_replace("mobile", '\D', '', 'g') ~ '^0\d{9}$' THEN regexp_replace("mobile", '\D', '', 'g')
    WHEN regexp_replace("mobile", '\D', '', 'g') ~ '^7\d{8}$' THEN '0' || regexp_replace("mobile", '\D', '', 'g')
    ELSE "mobile"
  END
WHERE "mobile" IS NOT NULL;

UPDATE "clients" SET "contactNumber" = CASE
    WHEN regexp_replace("contactNumber", '\D', '', 'g') ~ '^94\d{9}$' THEN '0' || substring(regexp_replace("contactNumber", '\D', '', 'g') from 3)
    WHEN regexp_replace("contactNumber", '\D', '', 'g') ~ '^0\d{9}$' THEN regexp_replace("contactNumber", '\D', '', 'g')
    WHEN regexp_replace("contactNumber", '\D', '', 'g') ~ '^7\d{8}$' THEN '0' || regexp_replace("contactNumber", '\D', '', 'g')
    ELSE "contactNumber"
  END
WHERE "contactNumber" IS NOT NULL;

-- staff.phone unique among active staff only — not representable as a plain
-- Prisma @@unique (no partial-index support in schema.prisma), so it isn't
-- mirrored there; this migration is the source of truth for it.
CREATE UNIQUE INDEX "staff_phone_active_key" ON "staff" ("phone") WHERE "status" = 'active' AND "phone" IS NOT NULL;
