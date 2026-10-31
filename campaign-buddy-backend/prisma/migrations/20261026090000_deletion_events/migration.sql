-- #113: append-only trail of soft deletes / restores (who, when). Additive.
CREATE TABLE "deletion_events" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "campaignId" TEXT,
    "action" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deletion_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "deletion_events_entityType_entityId_at_idx" ON "deletion_events"("entityType", "entityId", "at" DESC);
CREATE INDEX "deletion_events_campaignId_at_idx" ON "deletion_events"("campaignId", "at" DESC);
