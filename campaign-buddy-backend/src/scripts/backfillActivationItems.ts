import { prisma } from "../utils/prisma";

async function main() {
  const campaigns = await prisma.campaign.findMany({
    select: { id: true, campaignItems: { select: { id: true } }, activations: { select: { id: true } } },
  });

  const rows = campaigns.flatMap((c) =>
    c.activations.flatMap((a) => c.campaignItems.map((ci) => ({ activationId: a.id, campaignItemId: ci.id })))
  );
  if (rows.length === 0) return console.log("Nothing to backfill.");

  const res = await prisma.activationItem.createMany({ skipDuplicates: true, data: rows });
  console.log(`Backfilled ${res.count} missing activation items across ${campaigns.length} campaigns.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
