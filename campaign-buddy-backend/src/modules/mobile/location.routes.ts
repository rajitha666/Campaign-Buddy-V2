import { Router } from "express";
import { prisma } from "../../utils/prisma";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiError } from "../../utils/apiResponse";

const router = Router();

router.post(
  "/location/ping",
  asyncHandler(async (req, res) => {
    const { latitude, longitude, accuracyMeters, capturedAt, timestamp, appState, batteryPercent } = req.body as {
      latitude: number;
      longitude: number;
      accuracyMeters?: number;
      capturedAt?: string;
      timestamp?: string; // CampaignBuddy_API_Spec.md §5 names it `timestamp`
      appState?: "foreground" | "background";
      batteryPercent?: number;
    };
    const capturedIso = capturedAt ?? timestamp;

    const openShift = await prisma.attendanceRecord.findFirst({
      where: { activation: { staffId: req.staff!.sub }, checkInAt: { not: null }, checkOutAt: null },
    });
    if (!openShift) {
      throw new ApiError(422, "NOT_CHECKED_IN", "Location pings are only accepted while checked in");
    }

    await prisma.trackingPing.create({
      data: {
        activationId: openShift.activationId,
        latitude,
        longitude,
        accuracyMeters,
        capturedAt: capturedIso ? new Date(capturedIso) : new Date(),
        appState: appState ?? "foreground",
        batteryPercent,
      },
    });

    res.status(204).send();
  })
);

export default router;
