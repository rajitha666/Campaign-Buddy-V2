/**
 * Last-known profile and shift state, kept on the device so a cold start with
 * no network can resume a session (see lib/offlineSession.ts). Stored in
 * SecureStore (Keychain / Keystore) rather than AsyncStorage: it holds the
 * rep's name and phone number, and it's small enough for SecureStore.
 *
 * Tenant-scoped like the credentials are: on a shared handset used by reps of
 * two agencies, one agency must not read the other's snapshot back.
 */
import { deleteItem, getItem, setItem } from '@/api/secureStore';
import type { AttendanceStatus, User } from '@/api/types';
import { localDayKey } from '@/lib/date';
import { secureStoreKey } from '@/lib/tenant';

// Resolved per call, not at module load: the tenant isn't known until the pin is
// restored at startup (lib/tenantMigration.ts).
const userKey = () => secureStoreKey('cb_session_user');
const attendanceKey = () => secureStoreKey('cb_session_attendance');

export interface AttendanceSnapshot {
  userId: string;
  /** Device-local calendar day the snapshot was taken on. */
  day: string;
  checkedIn: boolean;
  checkedOutToday: boolean;
  checkInAt: string | null;
  status: AttendanceStatus | null;
  locationVerified: boolean | null;
  /** Optional: snapshots saved by older app versions don't have them. */
  openAssignmentId?: string | null;
  workedAssignmentIds?: string[];
}

async function read<T>(key: string): Promise<T | null> {
  try {
    const raw = await getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

const write = (key: string, value: unknown) => setItem(key, JSON.stringify(value)).catch(() => {});

export const saveUserSnapshot = (user: User) => write(userKey(), user);
export const loadUserSnapshot = () => read<User>(userKey());

export const saveAttendanceSnapshot = (s: Omit<AttendanceSnapshot, 'day'>) => write(attendanceKey(), { ...s, day: localDayKey() });

/** Only returns a snapshot taken today for this user; anything older is not a usable shift state. */
export async function loadAttendanceSnapshot(userId: string): Promise<AttendanceSnapshot | null> {
  const snap = await read<AttendanceSnapshot>(attendanceKey());
  return snap && snap.userId === userId && snap.day === localDayKey() ? snap : null;
}

export async function clearSessionSnapshots(): Promise<void> {
  await Promise.all([deleteItem(userKey()), deleteItem(attendanceKey())]).catch(() => {});
}
