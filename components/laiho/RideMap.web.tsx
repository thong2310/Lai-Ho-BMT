import { useEffect, useMemo, useRef, type CSSProperties } from "react";
import { StyleSheet, View } from "react-native";

import { trpc } from "@/lib/trpc";
import { Notice } from "./ui";
import { type RideMapProps } from "./RideMap";

function apiOrigin(value: string): string {
  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
}

export function RideMap({ state, height = 280 }: RideMapProps) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const stateRef = useRef(state);
  const config = trpc.maps.config.useQuery(undefined, {
    retry: 1,
    staleTime: 60_000,
  });
  const origin = useMemo(
    () =>
      typeof window !== "undefined" ? apiOrigin(window.location.origin) : "",
    [],
  );

  useEffect(() => {
    stateRef.current = state;
    const frame = frameRef.current;
    if (!frame?.contentWindow || !origin) return;
    frame.contentWindow.postMessage({ type: "LAIHO_MAP", state }, origin);
  }, [origin, state]);

  if (config.isLoading) {
    return <Notice text="Đang chuẩn bị bản đồ…" tone="blue" />;
  }
  if (config.isError || !config.data?.available || !origin) {
    return (
      <Notice
        text="Bản đồ hiện chưa khả dụng. Vui lòng thử lại sau; thông tin tọa độ vẫn được bảo toàn."
        tone="amber"
      />
    );
  }

  return (
    <View style={[styles.frame, { height }]}>
      <iframe
        ref={frameRef}
        title="Bản đồ lộ trình và vị trí"
        srcDoc={config.data.html}
        onLoad={() => {
          frameRef.current?.contentWindow?.postMessage(
            { type: "LAIHO_MAP", state: stateRef.current },
            origin,
          );
        }}
        style={iframeStyle}
        referrerPolicy="origin"
      />
    </View>
  );
}

export default RideMap;

const styles = StyleSheet.create({
  frame: {
    width: "100%",
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "#F5F8F6",
  },
});

const iframeStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  border: "0",
  display: "block",
};
