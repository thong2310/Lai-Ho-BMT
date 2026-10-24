export interface Coordinate {
  lat: number;
  lng: number;
}
export interface GeoPlace extends Coordinate {
  label: string;
  placeId?: string;
  zone?: string;
}
export interface RoutePreview {
  pickup: GeoPlace;
  dropoff: GeoPlace;
  distanceKm: number;
  durationSeconds: number;
  polyline: string;
  routeToken: string;
  expiresAt: string;
}
export interface RideRoute {
  pickup: Coordinate;
  dropoff: Coordinate;
  polyline: string;
  durationSeconds: number;
  source: "google_maps";
}
export interface DriverLocation extends Coordinate {
  accuracy: number | null;
  capturedAt: string;
  receivedAt: string;
  driverId: number;
  sharing: boolean;
  stale: boolean;
}
export interface TrackingSnapshot {
  rideId: number;
  driverId: number | null;
  canShare: boolean;
  active: boolean;
  route: RideRoute | null;
  location: DriverLocation | null;
}
export interface MapState {
  pickup?: Coordinate | null;
  dropoff?: Coordinate | null;
  driver?: Coordinate | null;
  polyline?: string | null;
}
