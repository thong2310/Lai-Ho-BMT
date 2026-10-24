import { DEFAULT_PRICING, type Driver, type Ride, type Workspace } from '@/shared/domain';
const now = new Date();
const at = (minutes: number) => new Date(now.getTime() + minutes * 60000).toISOString();
const drivers: Driver[] = [
  { id: 1, userId: -1, name: 'Nguyễn Minh Anh', phone: '0900 000 001', zone: 'Quận 1', experience: 6, licenseNumber: 'GPLX-DEMO-001', documentNote: 'Hồ sơ minh họa — không phải giấy tờ thật', vehiclePlate: 'Xe khách hàng', verification: 'verified', rejectionReason: null, available: true, rating: 4.9, trips: 126, createdAt: at(-360) },
  { id: 2, userId: -2, name: 'Trần Hoàng Nam', phone: '0900 000 002', zone: 'Bình Thạnh', experience: 4, licenseNumber: 'GPLX-DEMO-002', documentNote: 'Hồ sơ minh họa — không phải giấy tờ thật', vehiclePlate: 'Xe khách hàng', verification: 'verified', rejectionReason: null, available: true, rating: 4.8, trips: 89, createdAt: at(-300) },
  { id: 3, userId: -3, name: 'Lê Quốc Bảo', phone: '0900 000 003', zone: 'Thủ Đức', experience: 3, licenseNumber: 'GPLX-DEMO-003', documentNote: 'Bằng lái B2 — dữ liệu tự khai minh họa', vehiclePlate: 'Xe khách hàng', verification: 'pending', rejectionReason: null, available: false, rating: 0, trips: 0, createdAt: at(-180) },
];
const rides: Ride[] = [
  { id: 1, code: 'LH-1001', customerId: -10, customerName: 'Khách minh họa', driverId: null, driverName: null, pickup: 'Nhà hát Thành phố, Quận 1', dropoff: 'Landmark 81, Bình Thạnh', zone: 'Quận 1', distanceKm: 7.2, scheduledAt: at(15), vehicleType: 'automatic', phone: '0900 000 010', note: 'Đón ở sảnh chính. Dữ liệu minh họa.', price: 235200, driverIncome: 188160, status: 'pending', createdAt: at(-3) },
  { id: 2, code: 'LH-1002', customerId: -11, customerName: 'Khách minh họa', driverId: 2, driverName: 'Trần Hoàng Nam', pickup: 'Thảo Điền, TP. Thủ Đức', dropoff: 'Phú Mỹ Hưng, Quận 7', zone: 'Thủ Đức', distanceKm: 16.8, scheduledAt: at(-20), vehicleType: 'luxury', phone: '0900 000 011', note: 'Xe SUV 7 chỗ. Dữ liệu minh họa.', price: 418800, driverIncome: 335040, status: 'in_progress', createdAt: at(-50) },
  { id: 3, code: 'LH-1003', customerId: -12, customerName: 'Khách minh họa', driverId: 1, driverName: 'Nguyễn Minh Anh', pickup: 'Võ Văn Tần, Quận 3', dropoff: 'Sân bay Tân Sơn Nhất', zone: 'Quận 3', distanceKm: 9.5, scheduledAt: at(-130), vehicleType: 'automatic', phone: '0900 000 012', note: '', price: 232000, driverIncome: 185600, status: 'completed', createdAt: at(-160) },
];
export function getDemoWorkspace(role: 'customer' | 'driver' | 'admin'): Workspace {
  const events = [
    { id: 1, rideId: 1, message: 'Khách đã tạo yêu cầu đặt tài xế', actorName: 'Khách minh họa', createdAt: at(-3) },
    { id: 2, rideId: 2, message: 'Tài xế bắt đầu chuyến đi', actorName: 'Trần Hoàng Nam', createdAt: at(-20) },
    { id: 3, rideId: 3, message: 'Chuyến đi đã hoàn tất', actorName: 'Nguyễn Minh Anh', createdAt: at(-110) },
  ];
  return { rides: role === 'driver' ? rides.filter(r => r.driverId === 1) : role === 'customer' ? rides.slice(0, 1) : rides, drivers: role === 'admin' ? drivers : [], profile: role === 'driver' ? drivers[0] : null, offers: role === 'driver' ? [{ id: 1, rideId: 1, driverId: 1, status: 'sent', expiresAt: at(5), ride: rides[0] }] : [], events, pricing: DEFAULT_PRICING };
}
