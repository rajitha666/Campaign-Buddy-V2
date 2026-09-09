/**
 * Demo data seeder — builds a rich, believable campaign ("Radiance Q3 Push")
 * with roughly a week of field activity, for product demos, sales walkthroughs
 * and the user-training screenshots.
 *
 * Safe to re-run: everything is upserted / found-or-created and keyed on stable
 * codes, so a second run refreshes dates and daily data without duplicating.
 * It does NOT touch the base seed's "Sktest Activation" campaign.
 *
 *   cd campaign-buddy-backend && npx ts-node prisma/demo-seed.ts
 *
 * Logins after running:
 *   Portal  admin      / ChangeMe123!
 *   Portal  supervisor / Portal123!   (Dinesh Ranatunga — 2 outlets on Radiance Q3 Push)
 *   Portal  sponsor    / Portal123!   (Prisha Naturals — all outlets on Radiance Q3 Push)
 *   Mobile  0771234567 / Field123!    (Sanduni Kumari — Nawala Retail Outlet)
 *   Mobile  0762223344 / Field123!    (Kasun Perera — Keells Rajagiriya)
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

const D = (daysAgo: number) => {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() - daysAgo));
};
// wall-clock time in Asia/Colombo (UTC+5:30) on the given day, returned as a UTC instant
const COLOMBO_OFFSET_MIN = 5 * 60 + 30;
const at = (daysAgo: number, h: number, m = 0) => {
  const d = D(daysAgo);
  return new Date(d.getTime() + (h * 60 + m - COLOMBO_OFFSET_MIN) * 60000);
};
const rnd = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

async function findOrCreate<T>(find: () => Promise<T | null>, create: () => Promise<T>): Promise<T> {
  return (await find()) ?? (await create());
}

async function main() {
  const portalHash = await bcrypt.hash("Portal123!", 10);
  const fieldHash = await bcrypt.hash("Field123!", 10);

  // ---- client + brand + catalog ----
  const client = await findOrCreate(
    () => prisma.client.findFirst({ where: { companyName: "Prisha Naturals (Pvt) Ltd" } }),
    () => prisma.client.create({ data: { companyName: "Prisha Naturals (Pvt) Ltd", clientName: "Prisha Naturals", contactNumber: "+94 11 234 5678", email: "contact@prishanaturals.lk", address: "No. 42, Havelock Road, Colombo 05" } }),
  );
  const brand = await findOrCreate(
    () => prisma.brand.findFirst({ where: { name: "Sulfate Free Shampoo Range", clientId: client.id } }),
    () => prisma.brand.create({ data: { name: "Sulfate Free Shampoo Range", clientId: client.id } }),
  );

  const itemDefs = [
    { sku: "SFS-LAV-320", name: "Sulfate Free Shampoo — Lavender 320ml", unitPrice: 3200, reorderLevel: 8, description: "Gentle daily formula with lavender oil" },
    { sku: "SFS-TTR-320", name: "Sulfate Free Shampoo — Tea Tree 320ml", unitPrice: 3200, reorderLevel: 8, description: "Cleanses and soothes with tea tree oil" },
    { sku: "SFS-ALO-320", name: "Sulfate Free Shampoo — Aloe Vera 320ml", unitPrice: 3200, reorderLevel: 8, description: "Hydrating formula with aloe vera" },
  ];
  const items = [] as { id: string; name: string; unitPrice: number }[];
  for (const d of itemDefs) {
    const it = await findOrCreate(
      () => prisma.item.findFirst({ where: { brandId: brand.id, sku: d.sku } }),
      () => prisma.item.create({ data: { brandId: brand.id, ...d } }),
    );
    items.push({ id: it.id, name: it.name, unitPrice: it.unitPrice });
  }

  // ---- cities + outlets ----
  const cityDefs = [
    { name: "Nawala", province: "Western", district: "Colombo" },
    { name: "Rajagiriya", province: "Western", district: "Colombo" },
    { name: "Dehiwala", province: "Western", district: "Colombo" },
    { name: "Nugegoda", province: "Western", district: "Colombo" },
  ];
  const cities: Record<string, string> = {};
  for (const c of cityDefs) {
    const row = await findOrCreate(
      () => prisma.city.findFirst({ where: { name: c.name, province: c.province } }),
      () => prisma.city.create({ data: c }),
    );
    cities[c.name] = row.id;
  }

  const outletDefs = [
    { outletNo: "OUT-0001", name: "Nawala Retail Outlet", city: "Nawala", lat: 6.8845, lng: 79.8887, contactPerson: "R. Gunasekara", address: "221 Nawala Road" },
    { outletNo: "OUT-0002", name: "Keells Rajagiriya", city: "Rajagiriya", lat: 6.9092, lng: 79.8942, contactPerson: "S. Wickrama", address: "88 Kotte Road" },
    { outletNo: "OUT-0003", name: "Arpico Dehiwala", city: "Dehiwala", lat: 6.8512, lng: 79.8656, contactPerson: "N. Rathnayake", address: "75 Galle Road" },
    { outletNo: "OUT-0004", name: "Glomark Nugegoda", city: "Nugegoda", lat: 6.8724, lng: 79.8897, contactPerson: "A. Jayawardena", address: "120 High Level Road" },
  ];
  const outlets: Record<string, { id: string; lat: number; lng: number }> = {};
  for (const o of outletDefs) {
    const row = await findOrCreate(
      () => prisma.outlet.findFirst({ where: { outletNo: o.outletNo } }),
      () => prisma.outlet.create({ data: { outletNo: o.outletNo, name: o.name, cityId: cities[o.city], latitude: o.lat, longitude: o.lng, contactPerson: o.contactPerson, address: o.address, phone: "+94 11 2" + rnd(100000, 999999) } }),
    );
    outlets[o.name] = { id: row.id, lat: o.lat, lng: o.lng };
  }

  // ---- portal users: link `supervisor` User to a Staff, keep `sponsor` ----
  const supervisorUser = await prisma.user.upsert({
    where: { username: "supervisor" },
    create: { username: "supervisor", passwordHash: portalHash, displayName: "Dinesh Ranatunga (Supervisor)", roleId: "supervisor" },
    update: { passwordHash: portalHash, displayName: "Dinesh Ranatunga (Supervisor)" },
  });
  const sponsorUser = await prisma.user.upsert({
    where: { username: "sponsor" },
    create: { username: "sponsor", passwordHash: portalHash, displayName: "Prisha Naturals (Sponsor)", roleId: "sponsor" },
    update: { passwordHash: portalHash, displayName: "Prisha Naturals (Sponsor)" },
  });

  // ---- staff ----
  const supDefs = [
    { employeeId: "SUP-0001", fullName: "Dinesh Ranatunga", displayName: "Dinesh", mobileUsername: "dinesh", phone: "+94775551122", city: "Rajagiriya", linkedUserId: supervisorUser.id },
    { employeeId: "SUP-0002", fullName: "Ishara Fernando", displayName: "Ishara", mobileUsername: "ishara", phone: "+94775559988", city: "Dehiwala", linkedUserId: null as string | null },
  ];
  const supervisors: Record<string, string> = {};
  for (const s of supDefs) {
    const row = await prisma.staff.upsert({
      where: { mobileUsername: s.mobileUsername },
      create: { employeeId: s.employeeId, fullName: s.fullName, displayName: s.displayName, userType: "supervisor", mobileUsername: s.mobileUsername, passwordHash: fieldHash, phone: s.phone, cityId: cities[s.city], status: "active", linkedUserId: s.linkedUserId ?? undefined },
      update: { passwordHash: fieldHash, linkedUserId: s.linkedUserId ?? undefined },
    });
    supervisors[s.fullName] = row.id;
  }

  const promDefs = [
    { employeeId: "EMP-0001", fullName: "Sanduni Kumari", displayName: "Sanduni", mobileUsername: "sktest", phone: "+94771234567", city: "Nawala", outlet: "Nawala Retail Outlet", supervisor: "Dinesh Ranatunga" },
    { employeeId: "EMP-0002", fullName: "Kasun Perera", displayName: "Kasun", mobileUsername: "kasunp", phone: "+94762223344", city: "Rajagiriya", outlet: "Keells Rajagiriya", supervisor: "Dinesh Ranatunga" },
    { employeeId: "EMP-0003", fullName: "Nadeesha Silva", displayName: "Nadeesha", mobileUsername: "nadeeshas", phone: "+94713334455", city: "Dehiwala", outlet: "Arpico Dehiwala", supervisor: "Ishara Fernando" },
    { employeeId: "EMP-0004", fullName: "Tharindu Jayasuriya", displayName: "Tharindu", mobileUsername: "tharinduj", phone: "+94714567890", city: "Nugegoda", outlet: "Glomark Nugegoda", supervisor: "Ishara Fernando" },
  ];
  const promoters: Record<string, string> = {};
  for (const p of promDefs) {
    const row = await prisma.staff.upsert({
      where: { mobileUsername: p.mobileUsername },
      create: { employeeId: p.employeeId, fullName: p.fullName, displayName: p.displayName, userType: "promoter", mobileUsername: p.mobileUsername, passwordHash: fieldHash, phone: p.phone, cityId: cities[p.city], status: "active", reportsToStaffId: supervisors[p.supervisor] },
      update: { passwordHash: fieldHash, phone: p.phone, reportsToStaffId: supervisors[p.supervisor], displayName: p.displayName, fullName: p.fullName },
    });
    promoters[p.fullName] = row.id;
  }

  // ---- campaign ----
  const start = D(6);
  const end = D(-24);
  let campaign = await prisma.campaign.findFirst({ where: { campaignNo: "CMP-Q3" } });
  campaign = campaign
    ? await prisma.campaign.update({ where: { id: campaign.id }, data: { startDate: start, endDate: end, status: "active", statusManuallySet: false } })
    : await prisma.campaign.create({ data: { campaignNo: "CMP-Q3", name: "Radiance Q3 Push", clientId: client.id, description: "Q3 in-store activation for the Sulfate Free Shampoo Range across four Colombo outlets.", startDate: start, endDate: end, status: "active" } });

  const campaignItems: Record<string, string> = {};
  for (const it of items) {
    const ci = await prisma.campaignItem.upsert({
      where: { campaignId_itemId: { campaignId: campaign.id, itemId: it.id } },
      create: { campaignId: campaign.id, itemId: it.id },
      update: {},
    });
    campaignItems[it.id] = ci.id;
  }

  // ---- grants ----
  await prisma.campaignAccessGrant.upsert({
    where: { userId_campaignId: { userId: sponsorUser.id, campaignId: campaign.id } },
    create: { userId: sponsorUser.id, campaignId: campaign.id, scopeType: "all", outletIds: [] },
    update: { scopeType: "all", outletIds: [] },
  });
  await prisma.campaignAccessGrant.upsert({
    where: { userId_campaignId: { userId: supervisorUser.id, campaignId: campaign.id } },
    create: { userId: supervisorUser.id, campaignId: campaign.id, scopeType: "subset", outletIds: [outlets["Nawala Retail Outlet"].id, outlets["Keells Rajagiriya"].id] },
    update: { scopeType: "subset", outletIds: [outlets["Nawala Retail Outlet"].id, outlets["Keells Rajagiriya"].id] },
  });

  // ---- custom sales fields ----
  const fieldDefs = [
    { key: "weather", label: "Weather", type: "select" as const, scope: "day" as const, options: ["Sunny", "Cloudy", "Rain"], sortOrder: 1, required: false },
    { key: "competitor_promo", label: "Competitor promo running?", type: "boolean" as const, scope: "day" as const, sortOrder: 2, required: false },
    { key: "samples_given", label: "Samples given", type: "number" as const, scope: "day" as const, sortOrder: 3, required: true },
    { key: "damaged_units", label: "Damaged units", type: "number" as const, scope: "product" as const, sortOrder: 1, required: false },
  ];
  const fieldIds: Record<string, string> = {};
  for (const f of fieldDefs) {
    const row = await prisma.salesFieldDefinition.upsert({
      where: { campaignId_key: { campaignId: campaign.id, key: f.key } },
      create: { campaignId: campaign.id, key: f.key, label: f.label, type: f.type, scope: f.scope, options: f.options ?? [], sortOrder: f.sortOrder, required: f.required },
      update: { label: f.label, sortOrder: f.sortOrder },
    });
    fieldIds[f.key] = row.id;
  }

  // ---- supervisor QA tasks ----
  const qa = [
    { category: "Sale", taskType: "range" as const, task: "Shelf pricing matches the campaign sheet" },
    { category: "Outlet PR", taskType: "range" as const, task: "Outlet shelf presence rating (1–5)" },
    { category: "Competitor Activities", taskType: "feedback" as const, task: "Competitor promotions observed today" },
    { category: "Attire & Grooming", taskType: "feedback" as const, task: "Uniform and grooming standard met" },
  ];
  const existingTasks = await prisma.supervisorTask.count({ where: { campaignId: campaign.id } });
  if (existingTasks === 0) {
    for (const t of qa) await prisma.supervisorTask.create({ data: { campaignId: campaign.id, ...t } });
  }

  // ---- activations ----
  const shiftStart = new Date(start.getTime() + (9 * 60 - COLOMBO_OFFSET_MIN) * 60000);
  const shiftEnd = new Date(start.getTime() + (18 * 60 - COLOMBO_OFFSET_MIN) * 60000);
  const actDefs = promDefs.map((p) => ({ prom: p.fullName, outlet: p.outlet, sup: p.supervisor, name: `${p.outlet.split(" ")[0]} weekday activation` }));
  const activations: { id: string; prom: string; outlet: { id: string; lat: number; lng: number }; items: Record<string, string> }[] = [];
  for (const a of actDefs) {
    let act = await prisma.activation.findFirst({ where: { campaignId: campaign.id, outletId: outlets[a.outlet].id, staffId: promoters[a.prom] } });
    act = act
      ? await prisma.activation.update({ where: { id: act.id }, data: { dateFrom: start, dateTo: end, supervisorStaffId: supervisors[a.sup], shiftStart, shiftEnd } })
      : await prisma.activation.create({ data: { name: a.name, campaignId: campaign.id, outletId: outlets[a.outlet].id, staffId: promoters[a.prom], supervisorStaffId: supervisors[a.sup], dateFrom: start, dateTo: end, shiftStart, shiftEnd, targetType: "brand_wise", targetCategorization: "daily", targetUnit: "unit_wise" } });
    const aitems: Record<string, string> = {};
    for (const it of items) {
      const ai = await findOrCreate(
        () => prisma.activationItem.findFirst({ where: { activationId: act.id, campaignItemId: campaignItems[it.id] } }),
        () => prisma.activationItem.create({ data: { activationId: act.id, campaignItemId: campaignItems[it.id] } }),
      );
      aitems[it.id] = ai.id;
    }
    // targets: 12 units/day per item
    for (const it of items) {
      const has = await prisma.activationTarget.findFirst({ where: { activationId: act.id, targetItemId: it.id } });
      if (!has) await prisma.activationTarget.create({ data: { activationId: act.id, dateFrom: start, dateTo: end, targetItemId: it.id, targetValue: 12, repeat: true } });
    }
    activations.push({ id: act.id, prom: a.prom, outlet: outlets[a.outlet], items: aitems });
  }

  // ---- supervisor visit activations (so Outlet Attendance / supervisor tracking have data) ----
  const supVisits: { id: string; sup: string; outlet: { id: string; lat: number; lng: number } }[] = [];
  for (const [supName, outletName] of [["Dinesh Ranatunga", "Keells Rajagiriya"], ["Ishara Fernando", "Arpico Dehiwala"]] as const) {
    let sv = await prisma.activation.findFirst({ where: { campaignId: campaign.id, outletId: outlets[outletName].id, staffId: supervisors[supName] } });
    sv = sv
      ? await prisma.activation.update({ where: { id: sv.id }, data: { dateFrom: start, dateTo: end, shiftStart, shiftEnd } })
      : await prisma.activation.create({ data: { name: `${outletName.split(" ")[0]} supervisor route`, campaignId: campaign.id, outletId: outlets[outletName].id, staffId: supervisors[supName], dateFrom: start, dateTo: end, shiftStart, shiftEnd } });
    supVisits.push({ id: sv.id, sup: supName, outlet: outlets[outletName] });
  }
  for (const sv of supVisits) {
    for (const day of [4, 2, 0]) {
      const date = D(day);
      const isToday = day === 0;
      await prisma.attendanceRecord.upsert({
        where: { activationId_date: { activationId: sv.id, date } },
        create: {
          activationId: sv.id, date, status: "on_time",
          checkInAt: at(day, isToday ? 10 : 11, rnd(0, 30)), checkInLat: sv.outlet.lat, checkInLng: sv.outlet.lng, checkInLocationVerified: true,
          checkOutAt: isToday ? null : at(day, 12, rnd(10, 40)), checkOutLat: isToday ? null : sv.outlet.lat, checkOutLng: isToday ? null : sv.outlet.lng,
        },
        update: {},
      });
    }
  }

  // ---- daily field activity: days 6..1 complete, day 0 (today) partial ----
  const leaveDayForNadeesha = 3; // Nadeesha on leave 3 days ago
  const checkedInToday = ["Sanduni Kumari", "Kasun Perera", "Nadeesha Silva"]; // Tharindu not in yet

  for (let day = 6; day >= 0; day--) {
    const date = D(day);
    for (const act of activations) {
      const onLeave = act.prom === "Nadeesha Silva" && day === leaveDayForNadeesha;
      const isToday = day === 0;
      const late = !onLeave && ((act.prom === "Tharindu Jayasuriya" && day === 2) || (act.prom === "Kasun Perera" && day === 5));

      // attendance
      let status: string = "on_time";
      let checkInAt: Date | null = at(day, 8, 55);
      let checkOutAt: Date | null = at(day, 18, rnd(2, 20));
      let confirmedCheckout = true;
      if (onLeave) { status = "leave"; checkInAt = null; checkOutAt = null; confirmedCheckout = false; }
      else if (late) { status = "late"; checkInAt = at(day, 9, rnd(25, 55)); }
      if (isToday) {
        checkOutAt = null; confirmedCheckout = false;
        if (checkedInToday.includes(act.prom)) { checkInAt = at(0, 9, rnd(1, 12)); status = "on_time"; }
        else { checkInAt = null; status = "pending"; }
      }
      const verified = checkInAt != null && !(act.prom === "Tharindu Jayasuriya" && day === 4);

      await prisma.attendanceRecord.upsert({
        where: { activationId_date: { activationId: act.id, date } },
        create: {
          activationId: act.id, date, status: status as any,
          checkInAt, checkInLat: checkInAt ? act.outlet.lat + (verified ? 0 : 0.004) : null, checkInLng: checkInAt ? act.outlet.lng : null,
          checkInLocationVerified: verified,
          checkOutAt, checkOutLat: checkOutAt ? act.outlet.lat : null, checkOutLng: checkOutAt ? act.outlet.lng : null,
          salesSummaryConfirmedAtCheckout: confirmedCheckout,
        },
        update: {
          status: status as any, checkInAt, checkOutAt, checkInLocationVerified: verified,
          checkInLat: checkInAt ? act.outlet.lat + (verified ? 0 : 0.004) : null, checkInLng: checkInAt ? act.outlet.lng : null,
          checkOutLat: checkOutAt ? act.outlet.lat : null, checkOutLng: checkOutAt ? act.outlet.lng : null,
          salesSummaryConfirmedAtCheckout: confirmedCheckout,
        },
      });

      if (onLeave) continue;

      // daily stats
      const footFall = isToday ? rnd(40, 120) : rnd(150, 280);
      const approached = Math.round(footFall * (0.42 + Math.random() * 0.15));
      const converted = Math.round(approached * (0.35 + Math.random() * 0.2));
      await prisma.dailyStats.upsert({
        where: { activationId_date: { activationId: act.id, date } },
        create: { activationId: act.id, date, footFall, approached, converted },
        update: { footFall, approached, converted },
      });

      // sales per item
      let idx = 0;
      for (const it of items) {
        const aiId = act.items[it.id];
        const opening = [48, 42, 36][idx] + (day % 2 === 0 ? 12 : 0);
        const sold = isToday ? rnd(2, 12) : rnd(6, 22);
        const oic = rnd(0, 4);
        const reorder = opening - sold <= 8;
        await prisma.salesRecord.upsert({
          where: { activationItemId_date: { activationItemId: aiId, date } },
          create: { activationItemId: aiId, date, openingStock: opening, soldToday: sold, otherInterestedCustomers: oic, reorderFlag: reorder },
          update: { openingStock: opening, soldToday: sold, otherInterestedCustomers: oic, reorderFlag: reorder },
        });
        // product-scope custom field: damaged units, occasionally
        if (!isToday && Math.random() < 0.25) {
          const existing = await prisma.salesFieldValue.findFirst({ where: { definitionId: fieldIds["damaged_units"], activationItemId: aiId, date } });
          if (!existing) await prisma.salesFieldValue.create({ data: { definitionId: fieldIds["damaged_units"], activationId: act.id, activationItemId: aiId, date, value: String(rnd(1, 3)) } });
        }
        idx++;
      }

      // day-scope custom fields
      const dayFields: Array<[string, string]> = [
        ["weather", ["Sunny", "Cloudy", "Rain"][rnd(0, 2)]],
        ["competitor_promo", Math.random() < 0.4 ? "true" : "false"],
        ["samples_given", String(rnd(20, 80))],
      ];
      for (const [key, value] of dayFields) {
        const existing = await prisma.salesFieldValue.findFirst({ where: { definitionId: fieldIds[key], activationId: act.id, activationItemId: null, date } });
        if (existing) await prisma.salesFieldValue.update({ where: { id: existing.id }, data: { value } });
        else await prisma.salesFieldValue.create({ data: { definitionId: fieldIds[key], activationId: act.id, date, value } });
      }

      // sales summary
      const confirmed = !isToday;
      await prisma.salesSummary.upsert({
        where: { activationId_date: { activationId: act.id, date } },
        create: { activationId: act.id, date, confirmed, confirmedAt: confirmed ? at(day, 18, 0) : null, remarks: confirmed ? ["Steady footfall, good afternoon.", "Competitor sampling near the entrance.", "Ran low on Tea Tree by 4pm.", "Quiet morning, picked up after lunch."][rnd(0, 3)] : null },
        update: { confirmed, confirmedAt: confirmed ? at(day, 18, 0) : null },
      });
    }
  }

  // ---- today's tracking pings for checked-in promoters ----
  const now = Date.now();
  for (const act of activations) {
    if (!checkedInToday.includes(act.prom)) continue;
    await prisma.trackingPing.deleteMany({ where: { activationId: act.id } });
    const pings = 16; // one per ~6 min over the last ~90 min
    for (let i = pings; i >= 1; i--) {
      const cap = new Date(now - i * 6 * 60000);
      await prisma.trackingPing.create({
        data: { activationId: act.id, capturedAt: cap, latitude: act.outlet.lat + (Math.random() - 0.5) * 0.0006, longitude: act.outlet.lng + (Math.random() - 0.5) * 0.0006, accuracyMeters: rnd(6, 20), appState: "foreground", batteryPercent: rnd(45, 95) },
      });
    }
  }

  // ---- today's tracking pings for supervisors on a visit ----
  for (const sv of supVisits) {
    if (sv.sup !== "Dinesh Ranatunga") continue; // Dinesh is "on a visit" now
    await prisma.trackingPing.deleteMany({ where: { activationId: sv.id } });
    for (let i = 10; i >= 1; i--) {
      await prisma.trackingPing.create({ data: { activationId: sv.id, capturedAt: new Date(now - i * 6 * 60000), latitude: sv.outlet.lat + (Math.random() - 0.5) * 0.0005, longitude: sv.outlet.lng + (Math.random() - 0.5) * 0.0005, accuracyMeters: rnd(8, 22), appState: "foreground", batteryPercent: rnd(50, 90) } });
    }
  }

  // ---- planned supervisor routes ----
  const routeExists = await prisma.supervisorRoute.count({ where: { campaignId: campaign.id } });
  if (routeExists === 0) {
    await prisma.supervisorRoute.create({ data: { campaignId: campaign.id, supervisorStaffId: supervisors["Dinesh Ranatunga"], outletIds: [outlets["Nawala Retail Outlet"].id, outlets["Keells Rajagiriya"].id], dateFrom: start, dateTo: end } });
    await prisma.supervisorRoute.create({ data: { campaignId: campaign.id, supervisorStaffId: supervisors["Ishara Fernando"], outletIds: [outlets["Arpico Dehiwala"].id, outlets["Glomark Nugegoda"].id], dateFrom: start, dateTo: end } });
  }

  // ---- leave requests ----
  const nadeesha = promoters["Nadeesha Silva"];
  const kasun = promoters["Kasun Perera"];
  const dinesh = supervisors["Dinesh Ranatunga"];
  const ishara = supervisors["Ishara Fernando"];
  await prisma.leaveRequest.deleteMany({ where: { staffId: { in: [nadeesha, kasun] } } });
  await prisma.leaveRequest.create({ data: { staffId: nadeesha, fromDate: D(-2), toDate: D(-2), reason: "personal", note: "Family matter, back the next day.", status: "pending" } });
  await prisma.leaveRequest.create({ data: { staffId: nadeesha, fromDate: D(leaveDayForNadeesha), toDate: D(leaveDayForNadeesha), reason: "sick_leave", note: "Fever.", status: "approved", approverId: ishara, decidedAt: at(leaveDayForNadeesha + 1, 8) } });
  await prisma.leaveRequest.create({ data: { staffId: kasun, fromDate: D(-6), toDate: D(-6), reason: "annual_leave", note: "Wedding.", status: "declined", approverId: dinesh, decidedAt: at(1, 10) } });

  const c = await Promise.all([prisma.attendanceRecord.count(), prisma.salesRecord.count(), prisma.dailyStats.count(), prisma.trackingPing.count(), prisma.leaveRequest.count(), prisma.salesFieldValue.count()]);
  console.log("Demo seed complete — Radiance Q3 Push");
  console.log(`  4 outlets, 4 promoters, 2 supervisors, 3 SKUs, 4 custom fields`);
  console.log(`  attendance ${c[0]}, sales ${c[1]}, stats ${c[2]}, pings ${c[3]}, leave ${c[4]}, custom values ${c[5]}`);
  console.log("  Portal: admin/ChangeMe123!  supervisor/Portal123!  sponsor/Portal123!");
  console.log("  Mobile: 0771234567/Field123! (Sanduni)  |  0762223344/Field123! (Kasun)");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
