import React, { useEffect, useState } from 'react';
import { Image, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Button, Card, COLORS, Empty, Field, Icon, Notice, Pill, RouteLine, SectionTitle, StatusPill } from '@/components/laiho/ui';
import { trpc } from '@/lib/trpc';
import { LOCATIONS, VEHICLES, formatDate, formatMoney, type Quote, type Ride, type VehicleType, type Workspace } from '@/shared/domain';

const HERO = '/manus-storage/async-images/NfkU7yC8QrqFl9NESXoht3/image-2.webp';
const localSchedule = () => {
  const d = new Date(Date.now() + 20 * 60000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};
function parseSchedule(text: string) { return new Date(text.replace(' ', 'T') + ':00+07:00'); }
function LocationInput({ label, value, onChange, onSelect, marker }: { label: string; value: string; onChange: (v: string) => void; onSelect: (i: number) => void; marker: string }) {
  const [open, setOpen] = useState(false);
  return <View style={{ gap: 6 }}><Text style={s.label}>{label}</Text><View style={s.location}><Icon name="location-outline" color={marker} size={20} /><FieldBare value={value} onChange={(v) => { onChange(v); setOpen(true); }} onFocus={() => setOpen(true)} /><Pressable onPress={() => setOpen(!open)} accessibilityLabel="Chọn địa điểm gợi ý"><Icon name="chevron-down" size={16} color={COLORS.muted} /></Pressable></View>{open && <View style={s.suggestions}>{LOCATIONS.map((location, index) => <Pressable key={location.label} onPress={() => { onSelect(index); setOpen(false); }} style={({ pressed }) => [s.suggestion, pressed && { backgroundColor: '#E8F5EE' }]}><Icon name="navigate-outline" size={15} color={COLORS.primary} /><Text style={s.small}>{location.label}</Text></Pressable>)}</View>}</View>;
}
function FieldBare({ value, onChange, onFocus }: { value: string; onChange: (v: string) => void; onFocus: () => void }) { return <TextInput accessibilityLabel="Địa điểm" value={value} onChangeText={onChange} onFocus={onFocus} style={{ flex: 1, fontSize: 13, color: COLORS.ink, paddingVertical: 12 }} placeholder="Nhập địa chỉ hoặc chọn gợi ý" placeholderTextColor={COLORS.muted} />; }
function estimateDistance(a: number, b: number) {
  const from = LOCATIONS[a], to = LOCATIONS[b], rad = Math.PI / 180;
  const dlat = (to.lat - from.lat) * rad, dlng = (to.lng - from.lng) * rad;
  const h = Math.sin(dlat / 2) ** 2 + Math.cos(from.lat * rad) * Math.cos(to.lat * rad) * Math.sin(dlng / 2) ** 2;
  return Math.max(0.5, Math.round(6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)) * 1.35 * 10) / 10);
}

export function CustomerWorkspace({ data, demo, onLogin, tab, authenticated, onNavigate }: { data: Workspace | null; demo: boolean; onLogin: () => void; tab: string; authenticated: boolean; onNavigate: (tab: string) => void }) {
  const { width } = useWindowDimensions();
  const wide = width >= 1100;
  const utils = trpc.useUtils();
  const pricing = trpc.booking.pricing.useQuery();
  const [pickup, setPickup] = useState(LOCATIONS[0].label);
  const [dropoff, setDropoff] = useState(LOCATIONS[1].label);
  const [fromIndex, setFromIndex] = useState(0);
  const [toIndex, setToIndex] = useState(1);
  const [zone, setZone] = useState(LOCATIONS[0].zone);
  const [km, setKm] = useState(String(estimateDistance(0, 1)));
  const [vehicle, setVehicle] = useState<VehicleType>('automatic');
  const [schedule, setSchedule] = useState(localSchedule);
  const [timing, setTiming] = useState<'now' | 'later'>('now');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [selected, setSelected] = useState<Ride | null>(null);
  const [cancelId, setCancelId] = useState<number | null>(null);
  const [clock, setClock] = useState(() => new Date(Date.now() + 5 * 60000).toISOString());
  useEffect(() => { const timer = setInterval(() => setClock(new Date(Date.now() + 5 * 60000).toISOString()), 30000); return () => clearInterval(timer); }, []);
  const scheduledDate = parseSchedule(schedule);
  const when = timing === 'later' && !Number.isNaN(scheduledDate.getTime()) ? scheduledDate.toISOString() : clock;
  const distance = Number(km.replace(',', '.'));
  const validDistance = Number.isFinite(distance) && distance >= 0.5 && distance <= 300;
  const quote = trpc.booking.quote.useQuery({ distanceKm: validDistance ? distance : 1, scheduledAt: when, vehicleType: vehicle }, { enabled: validDistance, staleTime: 10000 });
  const create = trpc.booking.create.useMutation({ onSuccess: (ride) => { setConfirm(false); setSuccess(`Đã tạo cuốc ${ride.code}. Yêu cầu đang chờ admin điều phối.`); utils.workspace.snapshot.invalidate(); onNavigate('trips'); }, onError: (e) => { setError(e.message); setConfirm(false); } });
  const cancel = trpc.booking.cancel.useMutation({ onSuccess: () => { setCancelId(null); setSelected(null); utils.workspace.snapshot.invalidate(); setSuccess('Đã hủy yêu cầu đặt tài xế.'); }, onError: (e) => setError(e.message) });
  function requestBooking() {
    setError('');
    if (!pickup.trim() || !dropoff.trim()) return setError('Vui lòng điền điểm đón và điểm đến.');
    if (pickup.trim() === dropoff.trim()) return setError('Điểm đón và điểm đến cần khác nhau.');
    if (!validDistance) return setError('Quãng đường phải từ 0,5 đến 300 km.');
    if (!/^(0|\+84)[0-9\s.-]{8,13}$/.test(phone)) return setError('Vui lòng nhập số điện thoại Việt Nam hợp lệ.');
    if (timing === 'later' && (Number.isNaN(parseSchedule(schedule).getTime()) || parseSchedule(schedule).getTime() < Date.now())) return setError('Thời gian đặt trước cần là thời điểm trong tương lai (giờ Việt Nam).');
    if (!authenticated || demo) return onLogin();
    if (!quote.data || quote.isFetching) return setError('Vui lòng chờ báo giá cập nhật.');
    setConfirm(true);
  }
  const quoteRows = (q: Quote) => [['Phí mở cuốc', q.baseFare], [`Quãng đường · ${q.distanceKm} km`, q.distanceFare], ...(q.nightFee ? [['Phụ phí đêm (22:00–06:00)', q.nightFee]] : []), ...(q.peakFee ? [['Phụ phí giờ cao điểm', q.peakFee]] : []), ...(q.vehicleFee ? [['Phụ phí loại xe', q.vehicleFee]] : []), ...(q.minAdjustment ? [['Điều chỉnh mức tối thiểu', q.minAdjustment]] : [])] as [string, number][];

  if (tab === 'pricing') return <View style={{ gap: 22 }}><SectionTitle title="Giá rõ ràng, trước khi đi" subtitle="Bảng giá hiện hành từ hệ thống. Báo giá được lưu theo từng cuốc." /><Card>{pricing.data ? <>{[['Phí mở cuốc', pricing.data.baseFare], ['Đơn giá mỗi km', pricing.data.perKm], ['Giá tối thiểu', pricing.data.minFare], ['Phụ phí đêm', pricing.data.nightFee], ['Phụ phí cao điểm', pricing.data.peakFee]].map(([label, amount]) => <View key={String(label)} style={s.priceRow}><Text style={s.body}>{label}</Text><Text style={s.priceValue}>{formatMoney(Number(amount))}</Text></View>)}<Notice text="Giờ đêm: 22:00–06:00. Giờ cao điểm: 07:00–09:00 và 17:00–19:00 (giờ Việt Nam). Phí loại xe được thể hiện trong báo giá trước khi xác nhận." /><Button title="Đặt tài xế ngay" onPress={() => onNavigate('book')} /></> : <Notice tone="amber" text={pricing.error ? 'Chưa tải được bảng giá. Vui lòng thử lại.' : 'Đang tải bảng giá…'} />}</Card><Notice tone="amber" text="Khoảng cách đang là ước tính từ địa điểm gợi ý hoặc số km bạn nhập. Chưa tích hợp Google Maps; giá chưa gồm phí cầu đường/đỗ xe phát sinh thực tế." /></View>;
  if (tab === 'help') return <View style={{ gap: 22 }}><SectionTitle title="An tâm trên mọi hành trình" subtitle="Thông tin sử dụng Lái Xe Hộ" />{[{ title: 'Lái hộ, không phải thuê xe', text: 'Tài xế đến và lái chính chiếc xe của bạn. Hãy chọn đúng loại hộp số và ghi chú đặc điểm xe để tài xế chuẩn bị.' }, { title: 'Hành trình được theo dõi thế nào?', text: 'Ứng dụng cập nhật trạng thái chuyến từ cùng cơ sở dữ liệu. Vị trí GPS trực tiếp và thông báo đẩy chưa được tích hợp trong bản đầu tiên.' }, { title: 'Hồ sơ tài xế được xét duyệt', text: 'Admin xét duyệt thông tin hồ sơ do tài xế khai báo trước khi cho phép nhận cuốc. Xác minh giấy tờ điện tử eKYC chưa kết nối nhà cung cấp.' }, { title: 'Bản dựng thử, chưa vận hành ngoài đời thực', text: 'Bản MVP hỗ trợ kiểm tra các luồng đặt–điều phối–nhận cuốc. Thanh toán hiện chưa thu tiền; cần cấu hình vận hành và nhà cung cấp trước khi phục vụ khách thật.' }].map(item => <Card key={item.title}><Text style={s.cardTitle}>{item.title}</Text><Text style={s.body}>{item.text}</Text></Card>)}</View>;
  if (tab === 'trips') return <View style={{ gap: 22 }}><SectionTitle title="Chuyến của tôi" subtitle="Cùng một lịch sử, trên website và điện thoại." right={<Button title="Đặt chuyến mới" icon="add" variant="secondary" onPress={() => onNavigate('book')} />} />{success ? <Notice text={success} /> : null}{error ? <Notice tone="red" text={error} /> : null}{!authenticated && !demo ? <Card><Empty title="Đăng nhập để xem hành trình" subtitle="Các cuốc của bạn được lưu trong hệ thống dùng chung." /><Button title="Đăng nhập bằng Manus" onPress={onLogin} /></Card> : data?.rides.length ? data.rides.map(ride => <Card key={ride.id}><View style={s.between}><Text style={s.cardTitle}>{ride.code}</Text><StatusPill status={ride.status} /></View><RouteLine pickup={ride.pickup} dropoff={ride.dropoff} /><View style={s.between}><Text style={s.small}>{formatDate(ride.scheduledAt)} · {ride.distanceKm} km</Text><Text style={s.priceValue}>{formatMoney(ride.price)}</Text></View>{ride.driverName && <Text style={s.body}>Tài xế: {ride.driverName}</Text>}<Button title="Xem hành trình" variant="secondary" onPress={() => setSelected(ride)} /></Card>) : <Card><Empty title="Chưa có chuyến đi nào" subtitle="Đặt tài xế đầu tiên để bắt đầu hành trình của bạn." /></Card>}
    <Modal visible={!!selected} transparent animationType="fade" onRequestClose={() => setSelected(null)}><View style={s.overlay}><ScrollView style={s.modal} contentContainerStyle={{ gap: 20, padding: 24 }}><View style={s.between}><Text style={s.cardTitle}>Hành trình {selected?.code}</Text><Pressable onPress={() => setSelected(null)}><Icon name="close" /></Pressable></View>{selected && <><StatusPill status={selected.status} /><RouteLine pickup={selected.pickup} dropoff={selected.dropoff} /><Text style={s.body}>{VEHICLES[selected.vehicleType]} · {formatDate(selected.scheduledAt)}</Text><Text style={s.priceValue}>{formatMoney(selected.price)}</Text><Text style={s.body}>{selected.driverName ? `Tài xế: ${selected.driverName}` : 'Đang tìm tài xế phù hợp'}</Text>{selected.note ? <Text style={s.body}>{selected.note}</Text> : null}{data?.events.filter(event => event.rideId === selected.id).map(event => <View key={event.id} style={{ gap: 5, borderLeftWidth: 2, borderColor: COLORS.primary, paddingLeft: 14 }}><Text style={s.body}>{event.message}</Text><Text style={s.small}>{formatDate(event.createdAt)}</Text></View>)}{!['completed', 'cancelled', 'in_progress'].includes(selected.status) && <Button title="Hủy yêu cầu" variant="danger" onPress={() => demo ? onLogin() : setCancelId(selected.id)} />}{cancelId !== null && <View style={{ gap: 12 }}><Notice tone="amber" text="Bạn chắc chắn muốn hủy cuốc này?" /><Button title="Xác nhận hủy" loading={cancel.isPending} variant="danger" onPress={() => cancel.mutate({ rideId: cancelId })} /></View>}</>}</ScrollView></View></Modal>
  </View>;

  return <View style={{ gap: 25 }}>
    <View style={{ gap: 8 }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><View style={{ width: 7, height: 7, backgroundColor: COLORS.primary, borderRadius: 5 }} /><Text style={s.eyebrow}>DỊCH VỤ TÀI XẾ LÁI HỘ</Text></View><Text style={[s.headline, { fontSize: wide ? 38 : 29 }]}>Bạn tận hưởng.{wide ? ' ' : '\n'}Chúng tôi cầm lái.</Text><Text style={s.subtitle}>Về nhà an tâm, trên chính chiếc xe của bạn.</Text></View>
    {error ? <Notice text={error} tone="red" /> : null}
    <View style={{ flexDirection: wide ? 'row' : 'column', gap: 24, alignItems: 'stretch' }}>
      <Card style={{ flex: wide ? 0.92 : undefined, padding: wide ? 26 : 20, gap: 20 }}>
        <View style={s.between}><Text style={s.cardTitle}>Đặt tài xế lái hộ</Text><View style={{ flexDirection: 'row', gap: 4 }}><Icon name="shield-checkmark-outline" size={15} color={COLORS.primary} /><Text style={[s.small, { color: COLORS.primary }]}>An tâm & minh bạch</Text></View></View>
        <View style={s.segment}>{(['now', 'later'] as const).map(t => <Pressable key={t} onPress={() => setTiming(t)} style={[s.segmentButton, timing === t && s.segmentActive]}><Icon name={t === 'now' ? 'flash-outline' : 'calendar-outline'} size={16} color={timing === t ? COLORS.primary : COLORS.muted} /><Text style={{ fontSize: 12, fontWeight: '600', color: timing === t ? COLORS.primary : COLORS.muted }}>{t === 'now' ? 'Đi ngay' : 'Đặt trước'}</Text></Pressable>)}</View>
        <LocationInput label="ĐIỂM ĐÓN" value={pickup} marker={COLORS.primary} onChange={setPickup} onSelect={i => { setFromIndex(i); setPickup(LOCATIONS[i].label); setZone(LOCATIONS[i].zone); setKm(String(estimateDistance(i, toIndex))); }} />
        <LocationInput label="ĐIỂM ĐẾN" value={dropoff} marker="#DDA03F" onChange={setDropoff} onSelect={i => { setToIndex(i); setDropoff(LOCATIONS[i].label); setKm(String(estimateDistance(fromIndex, i))); }} />
        <View style={{ gap: 8 }}><Text style={s.label}>XE CỦA BẠN</Text><View style={{ flexDirection: 'row', gap: 8 }}>{(Object.keys(VEHICLES) as VehicleType[]).map(v => <Pressable key={v} onPress={() => setVehicle(v)} style={[s.vehicle, vehicle === v && { borderColor: COLORS.primary, backgroundColor: '#F0F9F3' }]}><Icon name={v === 'luxury' ? 'car-sport-outline' : 'car-outline'} size={23} color={vehicle === v ? COLORS.primary : '#8A9D95'} /><Text style={{ fontSize: 10, color: vehicle === v ? COLORS.primary : '#7A8D85', fontWeight: vehicle === v ? '700' : '500' }}>{VEHICLES[v]}</Text></Pressable>)}</View></View>
        <View style={{ flexDirection: 'row', gap: 12 }}><View style={{ flex: 0.7 }}><Field label="Quãng đường ước tính (km)" value={km} onChangeText={setKm} keyboardType="decimal-pad" /></View><View style={{ flex: 1 }}><Field label="Số điện thoại liên hệ" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="09xx xxx xxx" /></View></View>
        {timing === 'later' && <Field label="Giờ Việt Nam (YYYY-MM-DD HH:mm)" value={schedule} onChangeText={setSchedule} placeholder="2026-10-25 20:30" />}
        <Field label="Ghi chú cho tài xế (không bắt buộc)" value={note} onChangeText={setNote} placeholder="Số tầng, đặc điểm xe, điểm hẹn…" />
        <View style={{ backgroundColor: '#F5F9F5', borderRadius: 12, padding: 16, gap: 10 }}><View style={s.between}><Text style={[s.label, { color: COLORS.ink }]}>BÁO GIÁ TỰ ĐỘNG</Text><Pill label={quote.isFetching ? 'Đang tính' : 'Đã gồm phụ phí'} /></View>{validDistance && quote.data ? <>{quoteRows(quote.data).map(([label, amount]) => <View style={s.priceRow} key={label}><Text style={s.small}>{label}</Text><Text style={s.small}>{formatMoney(amount)}</Text></View>)}<View style={[s.between, { borderTopWidth: 1, borderColor: '#DCE8DD', paddingTop: 12 }]}><Text style={s.body}>Tổng dự kiến</Text><Text style={{ fontSize: 25, color: COLORS.primary, fontWeight: '800' }}>{formatMoney(quote.data.total)}</Text></View></> : <Text style={s.small}>{!validDistance ? 'Nhập quãng đường từ 0,5–300 km.' : quote.error ? 'Chưa tải được báo giá. Vui lòng thử lại.' : 'Đang tải bảng giá từ hệ thống…'}</Text>}</View>
        <Button title={authenticated ? 'Xác nhận đặt tài xế' : 'Đăng nhập & đặt tài xế'} icon="arrow-forward" loading={create.isPending} onPress={requestBooking} />
        <Text style={[s.small, { textAlign: 'center', fontSize: 10, lineHeight: 17 }]}>Khoảng cách ước tính, chưa tích hợp bản đồ. Chưa thu tiền trong bản thử nghiệm.</Text>
      </Card>
      <View style={{ flex: wide ? 1.15 : undefined, gap: 20 }}>
        <View style={[s.hero, { height: wide ? 310 : 210 }]}><Image source={Platform.OS === "web" ? { uri: HERO } : require("../assets/images/hero-native.jpg")} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} resizeMode="cover" /><View style={s.heroOverlay}><Pill label="Lái xe của bạn · Chăm sóc hành trình" /><Text style={s.heroTitle}>Đi vui. Về an tâm.</Text><Text style={s.heroText}>Một người lái đáng tin cho những lúc bạn cần nghỉ ngơi.</Text></View></View>
        <View style={{ flexDirection: 'row', gap: 12 }}>{[{ icon: 'shield-checkmark-outline' as const, title: 'Tài xế xét duyệt', text: 'Hồ sơ được admin kiểm tra' }, { icon: 'wallet-outline' as const, title: 'Biết giá trước', text: 'Chi phí hiển thị minh bạch' }].map(item => <Card key={item.title} style={{ flex: 1, padding: 17, gap: 9 }}><View style={s.featureIcon}><Icon name={item.icon} color={COLORS.primary} size={23} /></View><Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.ink }}>{item.title}</Text><Text style={[s.small, { fontSize: 11, lineHeight: 18 }]}>{item.text}</Text></Card>)}</View>
        <Card style={{ gap: 18 }}><View style={s.between}><Text style={s.cardTitle}>Về nhà trong 3 bước</Text><Icon name="navigate-outline" size={18} color={COLORS.primary} /></View>{[{ n: '01', title: 'Cho chúng tôi biết hành trình', desc: 'Chọn điểm đón, điểm đến và xem báo giá.' }, { n: '02', title: 'Tài xế phù hợp nhận cuốc', desc: 'Admin điều phối đến tài xế đã xét duyệt.' }, { n: '03', title: 'Bạn nghỉ ngơi, chúng tôi lái', desc: 'Theo dõi hành trình ngay trong ứng dụng.' }].map(step => <View key={step.n} style={{ flexDirection: 'row', gap: 14 }}><View style={s.step}><Text style={{ color: COLORS.primary, fontWeight: '700', fontSize: 12 }}>{step.n}</Text></View><View style={{ gap: 5, flex: 1 }}><Text style={{ color: COLORS.ink, fontSize: 13, fontWeight: '600' }}>{step.title}</Text><Text style={s.small}>{step.desc}</Text></View></View>)}</Card>
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingHorizontal: 6 }}><Icon name="information-circle-outline" size={17} color={COLORS.muted} /><Text style={[s.small, { flex: 1, lineHeight: 19 }]}>MVP dành cho kiểm tra vận hành. Thanh toán, eKYC, định tuyến và GPS trực tiếp chưa kết nối.</Text></View>
      </View>
    </View>
    <Modal visible={confirm} transparent animationType="fade" onRequestClose={() => setConfirm(false)}><View style={s.overlay}><View style={[s.modal, { padding: 24, gap: 18 }]}><Text style={s.cardTitle}>Xác nhận hành trình</Text><RouteLine pickup={pickup} dropoff={dropoff} /><Text style={s.body}>{VEHICLES[vehicle]} · {formatDate(when)}</Text><Text style={{ fontSize: 29, color: COLORS.primary, fontWeight: '800' }}>{quote.data ? formatMoney(quote.data.total) : ''}</Text><Notice text="Yêu cầu sẽ được lưu vào hệ thống để admin điều phối. Chưa có thanh toán trực tuyến trong bản này." /><Button title="Đặt tài xế" loading={create.isPending} onPress={() => create.mutate({ pickup: pickup.trim(), dropoff: dropoff.trim(), zone, distanceKm: distance, scheduledAt: when, vehicleType: vehicle, phone, note })} /><Button title="Quay lại" variant="ghost" onPress={() => setConfirm(false)} /></View></View></Modal>
  </View>;
}
const s = StyleSheet.create({
  eyebrow: { color: COLORS.primary, fontWeight: '700', fontSize: 10, letterSpacing: 1.8 }, headline: { fontWeight: '800', letterSpacing: -1.1, color: COLORS.ink, lineHeight: 45 }, subtitle: { fontSize: 14, color: '#7C8E84', lineHeight: 22 },
  cardTitle: { color: COLORS.ink, fontWeight: '700', fontSize: 18, letterSpacing: -0.4 }, body: { color: '#526D5F', fontSize: 13, lineHeight: 21 }, small: { color: '#809287', fontSize: 12 }, label: { color: '#7A8E82', fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }, priceRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, paddingVertical: 3 }, priceValue: { color: COLORS.ink, fontSize: 17, fontWeight: '700' },
  segment: { flexDirection: 'row', padding: 4, backgroundColor: '#F2F6F2', borderRadius: 10, gap: 4 }, segmentButton: { flex: 1, flexDirection: 'row', gap: 7, justifyContent: 'center', alignItems: 'center', padding: 11, borderRadius: 7 }, segmentActive: { backgroundColor: 'white', shadowColor: '#45644E', shadowOpacity: 0.07, shadowRadius: 5 },
  location: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 12, backgroundColor: '#F8FAF8', borderWidth: 1, borderColor: '#DFE9E1', borderRadius: 10 }, suggestions: { backgroundColor: 'white', borderWidth: 1, borderColor: COLORS.border, borderRadius: 9 }, suggestion: { flexDirection: 'row', gap: 8, padding: 10 }, vehicle: { flex: 1, paddingVertical: 12, borderWidth: 1, borderColor: '#E3EBE4', borderRadius: 9, gap: 6, alignItems: 'center' },
  hero: { borderRadius: 16, overflow: 'hidden', backgroundColor: '#193F34' }, heroOverlay: { flex: 1, padding: 25, justifyContent: 'flex-end', gap: 10, backgroundColor: 'rgba(9,37,28,0.25)' }, heroTitle: { fontSize: 30, fontWeight: '800', color: 'white', letterSpacing: -0.8 }, heroText: { color: '#E4EEE5', fontSize: 12, maxWidth: 240, lineHeight: 20 },
  featureIcon: { width: 41, height: 41, borderRadius: 10, backgroundColor: '#EDF7EF', justifyContent: 'center', alignItems: 'center' }, step: { width: 35, height: 35, backgroundColor: '#F0F7EF', borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  overlay: { flex: 1, backgroundColor: 'rgba(14,36,28,0.45)', alignItems: 'center', justifyContent: 'center', padding: 20 }, modal: { backgroundColor: 'white', borderRadius: 18, width: '100%', maxWidth: 480, maxHeight: '90%' },
});
