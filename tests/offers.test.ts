import { describe, expect, it, vi } from 'vitest';
import { getDb } from '../server/db';
import { registerDriver, rejectOffer, verifyDriver } from '../server/domain-db';
vi.mock('../server/db', () => ({ getDb: vi.fn() }));

type FakeRow = Record<string, unknown>;
function fluent(value: unknown): any {
  const chain: any = {};
  for (const method of ['from', 'where', 'limit', 'for', 'set', 'values']) chain[method] = () => chain;
  chain.then = (resolve: (v: unknown) => void) => Promise.resolve(value).then(resolve);
  return chain;
}
function fakeDb(rows: FakeRow[][]) {
  const changes: unknown[] = [];
  const db: any = {
    select: vi.fn(() => fluent(rows.shift() ?? [])),
    update: vi.fn((table: unknown) => ({ set: (value: unknown) => { changes.push({ table, value }); return fluent([]); } })),
    insert: vi.fn(() => fluent([{ insertId: 1 }])),
    transaction: async (fn: (tx: any) => Promise<unknown>) => fn(db),
  };
  vi.mocked(getDb).mockResolvedValue(db);
  return { db, changes };
}
const user = { id: 42, name: 'Test-only driver', role: 'driver' as const };
const driver = { id: 7, userId: 42, name: 'Test-only driver', phone: '0901234567', zone: 'Quận 1', experience: 3, licenseNumber: 'TEST', documentNote: 'Test metadata', vehiclePlate: 'Xe khách hàng', verification: 'verified', available: true, rating: 0, trips: 0, createdAt: new Date(), rejectionReason: null };
const ride = { id: 11, status: 'offered' };
function offer(expired: boolean) { return { id: 5, rideId: 11, driverId: 7, status: 'sent', expiresAt: new Date(Date.now() + (expired ? -60000 : 60000)) }; }

describe('offer lifecycle (isolated mocks, no shared DB writes)', () => {
  it('rejects a decline after expiry without changing data', async () => {
    const expired = offer(true);
    const { db } = fakeDb([[driver], [expired], [ride], [driver], [expired]]);
    await expect(rejectOffer(user, 5)).rejects.toThrow('Offer has expired');
    expect(db.update).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });
  it('lets the owner decline an unexpired offer', async () => {
    const fresh = offer(false);
    const { db, changes } = fakeDb([[driver], [fresh], [ride], [driver], [fresh]]);
    await expect(rejectOffer(user, 5)).resolves.toEqual({ success: true });
    expect(changes).toEqual([expect.objectContaining({ value: { status: 'rejected' } })]);
    expect(db.insert).toHaveBeenCalledOnce();
  });
  it('revokes sent offers when a driver is rejected', async () => {
    const { changes } = fakeDb([[driver], []]);
    await verifyDriver({ ...user, role: 'admin' }, 7, 'rejected', 'Cần bổ sung thông tin');
    expect(changes).toContainEqual(expect.objectContaining({ value: { status: 'expired' } }));
  });
  it('revokes sent offers when credentials are resubmitted', async () => {
    const updated = { ...driver, documentNote: 'Metadata updated', verification: 'pending', available: false };
    const { changes } = fakeDb([[driver], [], [updated]]);
    await registerDriver(user, { name: driver.name, phone: driver.phone, zone: driver.zone, experience: 3, licenseNumber: 'TEST', documentNote: 'Metadata updated', vehiclePlate: driver.vehiclePlate });
    expect(changes).toContainEqual(expect.objectContaining({ value: { status: 'expired' } }));
  });
});
