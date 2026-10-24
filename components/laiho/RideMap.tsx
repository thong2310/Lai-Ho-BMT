import { StyleSheet, View } from "react-native";

import { Notice } from "./ui";
import type { MapState } from "@/shared/mobility";

export type RideMapProps = {
  state: MapState;
  height?: number;
};

/** Serialize only map state into JavaScript; never place coordinates in a URL. */
export function serializeMapState(state: MapState): string {
  return JSON.stringify(state)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/** Fallback for an unexpected platform resolver; web and native provide the real map. */
export function RideMap({ height = 280 }: RideMapProps) {
  return (
    <View style={[styles.container, { height }]}>
      <Notice
        text="Bản đồ chưa khả dụng trên thiết bị này. Bạn vẫn có thể xem thông tin lộ trình bên dưới."
        tone="amber"
      />
    </View>
  );
}

export default RideMap;

const styles = StyleSheet.create({
  container: {
    width: "100%",
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "#F5F8F6",
    justifyContent: "center",
    padding: 12,
  },
});
