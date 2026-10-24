import { useCallback, useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";
import WebView, { type WebView as WebViewInstance } from "react-native-webview";

import { trpc } from "@/lib/trpc";
import { Notice } from "./ui";
import { serializeMapState, type RideMapProps } from "./RideMap";

export function RideMap({ state, height = 280 }: RideMapProps) {
  const webViewRef = useRef<WebViewInstance | null>(null);
  const stateRef = useRef(state);
  const config = trpc.maps.config.useQuery(undefined, {
    retry: 1,
    staleTime: 60_000,
  });

  const injectState = useCallback(() => {
    const serialized = serializeMapState(stateRef.current);
    webViewRef.current?.injectJavaScript(
      `window.updateMap(${serialized}); true;`,
    );
  }, []);

  useEffect(() => {
    stateRef.current = state;
    injectState();
  }, [injectState, state]);

  if (config.isLoading) {
    return <Notice text="Đang chuẩn bị bản đồ…" tone="blue" />;
  }
  if (config.isError || !config.data?.available || !config.data.baseUrl) {
    return (
      <Notice
        text="Bản đồ hiện chưa khả dụng. Vui lòng thử lại sau; thông tin tọa độ vẫn được bảo toàn."
        tone="amber"
      />
    );
  }

  return (
    <View style={[styles.frame, { height }]}>
      <WebView
        ref={webViewRef}
        source={{ html: config.data.html, baseUrl: config.data.baseUrl }}
        onLoadEnd={injectState}
        javaScriptEnabled
        domStorageEnabled
        originWhitelist={["*"]}
        style={styles.webView}
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
  webView: { flex: 1, backgroundColor: "#F5F8F6" },
});
