import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../utils/prisma";
import { asyncHandler } from "../../utils/asyncHandler";
import { ok } from "../../utils/apiResponse";
import { validate } from "../../middleware/validate";
import { parsePreferencePatch } from "../../utils/userPreferences";

// Portal personalization — the signed-in user's own settings, stored on the
// account so they follow the user across devices. See utils/userPreferences.ts
// for the allowed keys.
//
//   GET /me/preferences   → { "<key>": value, … } (only keys the user has set)
//   PUT /me/preferences   → partial update; `null` resets a key; returns the full set
//
// Every portal persona may use this (it only ever touches req.user's own rows).
const router = Router();

async function currentPreferences(userId: string) {
  const rows = await prisma.userPreference.findMany({ where: { userId }, orderBy: { key: "asc" } });
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

router.get(
  "/me/preferences",
  asyncHandler(async (req, res) => {
    res.json(ok(await currentPreferences(req.user!.sub)));
  })
);

router.put(
  "/me/preferences",
  validate({ body: z.record(z.string(), z.unknown()) }),
  asyncHandler(async (req, res) => {
    const userId = req.user!.sub;
    const patch = parsePreferencePatch(req.body as Record<string, unknown>);

    await prisma.$transaction([
      ...patch.set.map(({ key, value }) =>
        prisma.userPreference.upsert({
          where: { userId_key: { userId, key } },
          create: { userId, key, value: value as object },
          update: { value: value as object },
        })
      ),
      ...(patch.reset.length ? [prisma.userPreference.deleteMany({ where: { userId, key: { in: patch.reset } } })] : []),
    ]);

    res.json(ok(await currentPreferences(userId)));
  })
);

export default router;
