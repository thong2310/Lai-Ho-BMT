export type RideStatus = 'pending' | 'offered' | 'accepted' | 'arriving' | 'met' | 'in_progress' | 'completed' | 'cancelled';
export type Verification = 'pending' | 'verified' | 'rejected' | 'suspended';
export type VehicleType = 'automatic' | 'manual' | 'luxury';
export type ViewRole = 'customer' | 'driver' | 'admin';
export interface Pricing { baseFare: number; perKm: number; minFare: number; nightFee: number; peakFee: number; commissionPercent: number }
export interface Quote { baseFare: number; distanceFare: number; nightFee: number; peakFee: number; vehicleFee: number; minAdjustment: number; total: number; driverIncome: number; distanceKm: number; estimatedMinutes: number }
export interface Ride { id: number; code: string; customerId: number; driverId: number | null; pickup: string; dropoff: string; zone: string; distanceKm: number; scheduledAt: string; vehicleType: VehicleType; phone: string; note: string; price: number; driverIncome: number; status: RideStatus; customerName: string; driverName: string | null; createdAt: string }
export interface Driver { id: number; userId: number; name: string; phone: string; zone: string; experience: number; licenseNumber: string; documentNote: string; vehiclePlate: string; verification: Verification; rejectionReason: string | null; available: boolean; rating: number; trips: number; createdAt: string }
export interface Offer { id: number; rideId: number; driverId: number; status: 'sent' | 'accepted' | 'rejected' | 'expired'; expiresAt: string; ride: Ride }
export interface RideEvent { id: number; rideId: number | null; message: string; actorName: string; createdAt: string }
export interface Workspace { rides: Ride[]; drivers: Driver[]; offers: Offer[]; events: RideEvent[]; profile: Driver | null; pricing: Pricing }
export const DEFAULT_PRICING: Pricing = { baseFare: 80000, perKm: 16000, minFare: 120000, nightFee: 40000, peakFee: 20000, commissionPercent: 20 };
export const STATUS_LABELS: Record<RideStatus, string> = { pending: 'Chờ điều phối', offered: 'Đã đẩy cuốc', accepted: 'Đã nhận cuốc', arriving: 'Đang đến', met: 'Đã gặp khách', in_progress: 'Đang chạy', completed: 'Hoàn tất', cancelled: 'Đã hủy' };
export const VERIFICATION_LABELS: Record<Verification, string> = { pending: 'Chờ xác minh', verified: 'Đã xác minh', rejected: 'Bị từ chối', suspended: 'Tạm khóa' };
export const VEHICLES: Record<VehicleType, string> = { automatic: 'Số tự động', manual: 'Số sàn', luxury: 'Xe cao cấp' };
export const NEXT_STATUS: Partial<Record<RideStatus, RideStatus>> = { accepted: 'arriving', arriving: 'met', met: 'in_progress', in_progress: 'completed' };
export const LOCATIONS = [
  { label: 'Nhà hát Thành phố, Quận 1', zone: 'Quận 1', lat: 10.7766, lng: 106.7033 },
  { label: 'Landmark 81, Bình Thạnh', zone: 'Bình Thạnh', lat: 10.7946, lng: 106.7218 },
  { label: 'Thảo Điền, TP. Thủ Đức', zone: 'Thủ Đức', lat: 10.8034, lng: 106.7325 },
  { label: 'Sân bay Tân Sơn Nhất', zone: 'Tân Bình', lat: 10.8187, lng: 106.6519 },
  { label: 'Phú Mỹ Hưng, Quận 7', zone: 'Quận 7', lat: 10.7285, lng: 106.7219 },
  { label: 'Võ Văn Tần, Quận 3', zone: 'Quận 3', lat: 10.7755, lng: 106.6878 },
];
export const ZONES = ['Quận 1', 'Quận 3', 'Bình Thạnh', 'Thủ Đức', 'Tân Bình', 'Quận 7'];
export function formatMoney(value: number) { return new Intl.NumberFormat('vi-VN').format(value) + 'đ'; }
export function formatDate(value: string) { return new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }); }
