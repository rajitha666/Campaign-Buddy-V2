-- Group outlets by sales region. Geofence radius is now per-activation, so drop it here.
ALTER TABLE "outlets" DROP COLUMN "geofenceRadiusMeters";
ALTER TABLE "outlets" ADD COLUMN "region" TEXT NOT NULL;
