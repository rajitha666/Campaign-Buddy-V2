/**
 * Test bootstrap. Loads .env.test (which MUST point DATABASE_URL at a disposable
 * database whose name ends in `_test` — the reset helper refuses to run against
 * anything else). Run once before the whole suite:
 *
 *   createdb -p 5433 campaign_buddy_test   # or CREATE DATABASE campaign_buddy_test
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5433/campaign_buddy_test \
 *     npx prisma migrate deploy
 *   npm test
 */
import { config } from "dotenv";
import { beforeAll } from "vitest";

config({ path: ".env.test" });

beforeAll(() => {
  if (!process.env.DATABASE_URL?.match(/_test(\?|$)/)) {
    throw new Error(
      "Refusing to run tests: DATABASE_URL must point at a *_test database. " +
        "Create .env.test (see test/setup.ts)."
    );
  }
  process.env.STAFF_JWT_SECRET ||= "test-staff-secret";
  process.env.USER_JWT_SECRET ||= "test-user-secret";
});
