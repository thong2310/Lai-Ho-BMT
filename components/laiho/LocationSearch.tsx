import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { trpc } from "@/lib/trpc";
import { LOCATIONS } from "@/shared/domain";
import type { GeoPlace } from "@/shared/mobility";
import { COLORS, Icon } from "./ui";

type Props = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onSelect: (place: GeoPlace) => void;
  marker: string;
};
export function LocationSearch({
  label,
  value,
  onChange,
  onSelect,
  marker,
}: Props) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setSearchTerm(value.trim()), 500);
    return () => clearTimeout(id);
  }, [value]);
  const results = trpc.maps.search.useQuery(
    { query: searchTerm },
    { enabled: open && searchTerm.length >= 3, staleTime: 60000, retry: false },
  );
  const choose = (place: GeoPlace) => {
    onSelect(place);
    setOpen(false);
  };
  return (
    <View style={s.container}>
      <Text style={s.label}>{label}</Text>
      <View style={s.inputRow}>
        <Icon name="location-outline" size={20} color={marker} />
        <TextInput
          accessibilityLabel={label}
          value={value}
          onChangeText={(text) => {
            onChange(text);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Tìm địa chỉ trên Google Maps"
          placeholderTextColor={COLORS.muted}
          style={s.input}
        />
        <Pressable
          onPress={() => setOpen((previous) => !previous)}
          accessibilityLabel="Mở hoặc đóng gợi ý địa chỉ"
          style={{ padding: 5 }}
        >
          <Icon
            name={open ? "chevron-up" : "chevron-down"}
            size={16}
            color={COLORS.muted}
          />
        </Pressable>
      </View>
      {open ? (
        <View style={s.options}>
          {results.isFetching ? (
            <Text style={s.hint}>Đang tìm địa chỉ…</Text>
          ) : null}
          {results.data?.map((place, index) => (
            <Pressable
              key={place.placeId ?? `${place.lat}:${place.lng}:${index}`}
              style={s.option}
              onPress={() => choose(place)}
            >
              <Icon name="search" size={14} color={COLORS.primary} />
              <Text style={s.optionText}>{place.label}</Text>
            </Pressable>
          ))}
          {results.error ? (
            <Text style={s.warning}>
              Chưa tìm được địa chỉ. Có thể dùng điểm gợi ý hoặc chuyển km thủ
              công.
            </Text>
          ) : null}
          {!results.isFetching && results.data?.length === 0 ? (
            <Text style={s.hint}>
              Không có kết quả. Thử địa chỉ cụ thể hơn.
            </Text>
          ) : null}
          <Text style={s.hint}>Địa điểm thường dùng tại TP.HCM</Text>
          {LOCATIONS.map((place) => (
            <Pressable
              key={place.label}
              style={s.option}
              onPress={() => choose(place)}
            >
              <Icon name="navigate-outline" size={14} color={COLORS.primary} />
              <Text style={s.optionText}>{place.label}</Text>
            </Pressable>
          ))}
          <Pressable onPress={() => setOpen(false)} style={s.option}>
            <Text style={[s.optionText, { color: COLORS.primary }]}>
              Đóng gợi ý
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
const s = StyleSheet.create({
  container: { gap: 7 },
  label: {
    fontSize: 11,
    fontWeight: "700",
    color: COLORS.muted,
    letterSpacing: 0.5,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 11,
    backgroundColor: "#F8FAF8",
  },
  input: { flex: 1, paddingVertical: 13, fontSize: 13, color: COLORS.ink },
  options: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 11,
    overflow: "hidden",
  },
  option: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 11,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#EDF3EF",
  },
  optionText: { flex: 1, fontSize: 12, color: COLORS.ink, lineHeight: 18 },
  hint: { fontSize: 11, color: COLORS.muted, padding: 10 },
  warning: { fontSize: 11, color: "#976E25", padding: 10 },
});
