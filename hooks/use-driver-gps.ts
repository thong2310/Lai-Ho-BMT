import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import * as Location from "expo-location";

import { trpc } from "@/lib/trpc";
import type { Coordinate } from "@/shared/mobility";
import { getCurrentCoordinate, type LocationErrorCode } from "./use-current-location";

export type DriverGpsErrorCode = LocationErrorCode | "FORBIDDEN" | "NETWORK" | "UNKNOWN";

export type DriverGpsError = {
  code: DriverGpsErrorCode;
  message: string;
};

type Session = {
  rideId: number;
  version: number;
  watcher: Location.LocationSubscription | null;
  serverId: string | null;
  active: boolean;
  stopRequested: boolean;
  stopSent: boolean;
  inFlightUpdate: Promise<unknown> | null;
  lastSentAt: number;
};

function isVisible(): boolean {
  if (AppState.currentState !== "active") return false;
  if (Platform.OS === "web" && typeof document !== "undefined") {
    return document.visibilityState === "visible";
  }
  return true;
}

function readError(error: unknown): DriverGpsError {
  if (error && typeof error === "object") {
    const record = error as {
      message?: unknown;
      data?: { code?: unknown };
      code?: unknown;
    };
    const trpcCode = record.data?.code ?? record.code;
    const message = typeof record.message === "string" ? record.message : "";
    if (trpcCode === "FORBIDDEN" || /forbidden|unauthor/i.test(message)) {
      return {
        code: "FORBIDDEN",
        message: "Bạn không có quyền chia sẻ GPS cho cuốc này.",
      };
    }
    if (typeof message === "string" && message) {
      return { code: "NETWORK", message };
    }
  }
  return { code: "NETWORK", message: "Không thể gửi vị trí lúc này. Hãy thử lại." };
}

function locationError(error: unknown): DriverGpsError {
  if (error && typeof error === "object" && "code" in error && "message" in error) {
    const value = error as { code?: unknown; message?: unknown };
    if (typeof value.code === "string" && typeof value.message === "string") {
      return { code: value.code as DriverGpsErrorCode, message: value.message };
    }
  }
  return { code: "UNAVAILABLE", message: "Không thể lấy vị trí hiện tại. Hãy kiểm tra GPS và thử lại." };
}

/**
 * Foreground-only driver sharing. It never starts by itself: callers must invoke start().
 * Visibility changes cancel the session and do not restart it when the app returns.
 */
export function useDriverGps(rideId: number, enabled = true) {
  const beginMutation = trpc.location.begin.useMutation();
  const updateMutation = trpc.location.update.useMutation();
  const stopMutation = trpc.location.stop.useMutation();
  const beginMutationRef = useRef(beginMutation);
  const updateMutationRef = useRef(updateMutation);
  const stopMutationRef = useRef(stopMutation);
  const sessionRef = useRef<Session | null>(null);
  const versionRef = useRef(0);
  const startGuardRef = useRef(false);
  const mountedRef = useRef(true);
  const [sharing, setSharing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<DriverGpsError | null>(null);
  const [coordinate, setCoordinate] = useState<Coordinate | null>(null);

  useEffect(() => {
    beginMutationRef.current = beginMutation;
    updateMutationRef.current = updateMutation;
    stopMutationRef.current = stopMutation;
  }, [beginMutation, stopMutation, updateMutation]);

  const sendStop = useCallback(async (session: Session) => {
    session.stopRequested = true;
    if (session.stopSent || !session.serverId) return;
    session.stopSent = true;
    try {
      await stopMutationRef.current.mutateAsync({ rideId: session.rideId, sessionId: session.serverId });
    } catch (caught) {
      const next = readError(caught);
      if (next.code === "FORBIDDEN" && mountedRef.current) setError(next);
    }
  }, []);

  const stop = useCallback(async () => {
    const session = sessionRef.current;
    versionRef.current += 1;
    sessionRef.current = null;
    if (mountedRef.current) {
      setSharing(false);
      setBusy(false);
      setCoordinate(null);
    }
    if (!session) return;
    session.active = false;
    session.stopRequested = true;
    session.watcher?.remove();
    session.watcher = null;
    // Do not wait for an in-flight update: the server locks the ride and
    // invalidates the session, making either transaction order safe.
    await sendStop(session);
  }, [sendStop]);

  const start = useCallback(async () => {
    if (!enabled || startGuardRef.current || sessionRef.current || !isVisible()) return;
    startGuardRef.current = true;
    if (mountedRef.current) {
      setBusy(true);
      setError(null);
    }
    const version = ++versionRef.current;
    const session: Session = {
      rideId,
      version,
      watcher: null,
      serverId: null,
      active: true,
      stopRequested: false,
      stopSent: false,
      inFlightUpdate: null,
      lastSentAt: 0,
    };
    sessionRef.current = session;

    const isCurrent = () => sessionRef.current === session && versionRef.current === version && session.active;
    const cleanupBeforeWatch = () => {
      session.active = false;
      if (sessionRef.current === session) sessionRef.current = null;
    };

    try {
      // Permission and a real current coordinate are always requested before
      // the server creates a shareable session or a watcher is installed.
      const initial = await getCurrentCoordinate();
      if (!isCurrent() || !isVisible()) {
        cleanupBeforeWatch();
        return;
      }

      const begun = await beginMutationRef.current.mutateAsync({ rideId: session.rideId });
      session.serverId = begun.sessionId;
      if (!isCurrent() || !isVisible()) {
        cleanupBeforeWatch();
        await sendStop(session);
        return;
      }

      if (mountedRef.current) setCoordinate(initial);
      const watcher = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 5_000,
          distanceInterval: 10,
        },
        (position) => {
          if (!isCurrent() || !isVisible()) return;
          const next: Coordinate = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          };
          if (!Number.isFinite(next.lat) || !Number.isFinite(next.lng)) return;
          if (mountedRef.current) setCoordinate(next);
          const now = Date.now();
          if (session.inFlightUpdate || now - session.lastSentAt < 5_000 || !session.serverId) return;
          session.lastSentAt = now;
          const request = updateMutationRef.current.mutateAsync({
            rideId: session.rideId,
            sessionId: session.serverId,
            lat: next.lat,
            lng: next.lng,
            accuracy: Number.isFinite(position.coords.accuracy ?? NaN)
              ? position.coords.accuracy
              : null,
            capturedAt: new Date(position.timestamp).toISOString(),
          });
          session.inFlightUpdate = request;
          void request
            .catch((caught: unknown) => {
              if (!isCurrent()) return;
              const nextError = readError(caught);
              if (mountedRef.current) setError(nextError);
              if (nextError.code === "FORBIDDEN") void stop();
            })
            .finally(() => {
              if (session.inFlightUpdate === request) session.inFlightUpdate = null;
            });
        },
        () => {
          if (!isCurrent()) return;
          if (mountedRef.current) setError({ code: "UNAVAILABLE", message: "Không thể theo dõi vị trí GPS. Hãy thử lại." });
          void stop();
        },
      );
      if (!isCurrent() || !isVisible()) {
        watcher.remove();
        cleanupBeforeWatch();
        await sendStop(session);
        return;
      }
      session.watcher = watcher;
      if (mountedRef.current) setSharing(true);
    } catch (caught) {
      session.active = false;
      if (sessionRef.current === session) sessionRef.current = null;
      if (session.serverId) void sendStop(session);
      if (versionRef.current === version && mountedRef.current) setError(locationError(caught));
    } finally {
      startGuardRef.current = false;
      if (versionRef.current === version) {
        if (mountedRef.current) setBusy(false);
      }
    }
  }, [enabled, rideId, sendStop, stop]);

  useEffect(() => () => {
    mountedRef.current = false;
  }, []);

  useEffect(() => {
    const cancelIfHidden = () => {
      if (!isVisible() && sessionRef.current) void stop();
    };
    const appSubscription = AppState.addEventListener("change", cancelIfHidden);
    let visibilityHandler: (() => void) | undefined;
    if (Platform.OS === "web" && typeof document !== "undefined") {
      visibilityHandler = cancelIfHidden;
      document.addEventListener("visibilitychange", visibilityHandler);
    }
    return () => {
      appSubscription.remove();
      if (visibilityHandler) document.removeEventListener("visibilitychange", visibilityHandler);
      void stop();
    };
  }, [stop]);

  return { sharing, busy, error, start, stop, coordinate };
}
