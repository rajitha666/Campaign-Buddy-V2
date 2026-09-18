import { prisma } from "./prisma";

type TaskLite = { id: string; taskType: "range" | "feedback" | "photo"; imageCount: number };
type Answer = { rating: number | null; feedback: string | null; photoCount: number };

// A task counts as answered when a range task is rated, a feedback task has
// text, or a photo task has all of its required photos.
export function checklistCompletion(tasks: TaskLite[], answers: Map<string, Answer>): { answered: number; total: number } {
  let answered = 0;
  for (const t of tasks) {
    const a = answers.get(t.id);
    if (!a) continue;
    if (t.taskType === "range" && a.rating != null) answered++;
    else if (t.taskType === "feedback" && (a.feedback ?? "").trim() !== "") answered++;
    else if (t.taskType === "photo" && a.photoCount >= t.imageCount) answered++;
  }
  return { answered, total: tasks.length };
}

export interface ChecklistVisit {
  activationId: string;
  date: Date;
  outletId: string;
  outletName: string;
  promoterName: string;
  supervisorName: string;
  answered: number;
  total: number;
}

const day = (d: Date) => d.toISOString().slice(0, 10);

// Everything the summary needs for one campaign: the answers in range and the
// per-visit completion. A "visit" is a (promoter activation, day) the covering
// supervisor either checked in at OR started a checklist for — so a visit that
// never got a single answer still shows up as incomplete. Photo tasks are
// outlet-level (shared by every promoter that supervisor covers there), so they
// count toward each visit.
export async function loadChecklistData(opts: { campaignId: string; from?: Date; to?: Date; outletIds?: string[]; outletId?: string }) {
  const dateWhere = opts.from || opts.to ? { date: { ...(opts.from ? { gte: opts.from } : {}), ...(opts.to ? { lte: opts.to } : {}) } } : {};
  const outletWhere = opts.outletId ? { outletId: opts.outletId } : opts.outletIds ? { outletId: { in: opts.outletIds } } : {};
  const activationOutlet = opts.outletId ? { outletId: opts.outletId } : opts.outletIds ? { outletId: { in: opts.outletIds } } : {};

  const [tasks, responses, supervisorCheckIns] = await Promise.all([
    prisma.supervisorTask.findMany({ where: { campaignId: opts.campaignId, deletedAt: null }, orderBy: { createdAt: "asc" } }),
    prisma.supervisorTaskResponse.findMany({
      where: { task: { campaignId: opts.campaignId }, ...dateWhere, ...outletWhere },
      include: { task: true, supervisor: true, activation: { include: { staff: true, outlet: true } }, _count: { select: { photos: true } } },
    }),
    // Supervisors' own check-ins on activations they cover (record staff = the covering supervisor).
    prisma.attendanceRecord.findMany({
      where: {
        checkInAt: { not: null },
        staff: { is: { userType: "supervisor" } },
        activation: { campaignId: opts.campaignId, supervisorStaffId: { not: null }, ...activationOutlet },
        ...dateWhere,
      },
      include: { staff: true, activation: { include: { staff: true, outlet: true } } },
    }),
  ]);

  const photoCounts = new Map<string, number>(); // supervisor|outlet|day|task -> photos
  for (const r of responses) {
    if (r.task.taskType === "photo") photoCounts.set(`${r.supervisorStaffId}|${r.outletId}|${day(r.date)}|${r.taskId}`, r._count.photos);
  }
  const photoTasks = tasks.filter((t) => t.taskType === "photo");

  const visitsByKey = new Map<string, ChecklistVisit>();
  const addVisit = (v: {
    activationId: string; date: Date; outletId: string; outletName: string; promoterName: string;
    supervisorStaffId: string; supervisorName: string;
  }) => {
    const key = `${v.activationId}|${day(v.date)}`;
    if (visitsByKey.has(key)) return;
    const answers = new Map<string, Answer>();
    for (const other of responses) {
      if (other.activationId !== v.activationId || day(other.date) !== day(v.date) || other.task.taskType === "photo") continue;
      answers.set(other.taskId, { rating: other.rating, feedback: other.feedback, photoCount: 0 });
    }
    for (const t of photoTasks) {
      answers.set(t.id, { rating: null, feedback: null, photoCount: photoCounts.get(`${v.supervisorStaffId}|${v.outletId}|${day(v.date)}|${t.id}`) ?? 0 });
    }
    visitsByKey.set(key, {
      activationId: v.activationId, date: v.date, outletId: v.outletId, outletName: v.outletName,
      promoterName: v.promoterName, supervisorName: v.supervisorName, ...checklistCompletion(tasks, answers),
    });
  };

  for (const r of responses) {
    addVisit({
      activationId: r.activationId, date: r.date, outletId: r.outletId, outletName: r.activation.outlet.name,
      promoterName: r.activation.staff.fullName, supervisorStaffId: r.supervisorStaffId, supervisorName: r.supervisor.fullName,
    });
  }
  for (const c of supervisorCheckIns) {
    if (c.staffId !== c.activation.supervisorStaffId) continue; // a supervisor who is the activation's own staff isn't a covering visit
    addVisit({
      activationId: c.activationId, date: c.date, outletId: c.activation.outletId, outletName: c.activation.outlet.name,
      promoterName: c.activation.staff.fullName, supervisorStaffId: c.staffId, supervisorName: c.staff.fullName,
    });
  }
  return { tasks, responses, visits: [...visitsByKey.values()] };
}

export const average = (nums: number[]) => (nums.length ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100 : null);
