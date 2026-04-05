import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { getProperties, Property } from "../services/propertyService";
import type { ChatStackParamList } from "../navigation/ChatStack";
import { colors, fonts, spacing, borderWidth } from "../theme";

type Nav = NativeStackNavigationProp<ChatStackParamList, "PropertyList">;

function ScoreBadge({ grade }: { grade: string }) {
  const bgColor = grade === "A" || grade === "B" ? colors.sage : grade === "C" ? "#C9882E" : colors.rust;
  return (
    <View style={[styles.badge, { backgroundColor: bgColor }]}>
      <Text style={styles.badgeText}>{grade}</Text>
    </View>
  );
}

function PropertyCard({ property, onPress }: { property: Property; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`View ${property.address}`}
    >
      <View style={styles.cardContent}>
        <View style={{ flex: 1 }}>
          <Text style={styles.address}>{property.address}</Text>
          <Text style={styles.meta}>Built {property.yearBuilt}</Text>
        </View>
        <View style={styles.scoreCol}>
          <Text style={styles.scoreNum}>{property.score}</Text>
          <ScoreBadge grade={property.scoreGrade} />
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function PropertyListScreen() {
  const navigation = useNavigation<Nav>();
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    getProperties()
      .then(setProperties)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.rust} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.sectionLabel}>MY PROPERTIES</Text>
      </View>
      <FlatList
        data={properties}
        keyExtractor={(p) => p.id}
        renderItem={({ item }) => (
          <PropertyCard
            property={item}
            onPress={() => navigation.navigate("PropertyDetail", { property: item })}
          />
        )}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.empty}>No properties yet. Add one to get started.</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  center:    { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.paper },
  header:    { padding: spacing.md, borderBottomWidth: borderWidth, borderBottomColor: colors.rule },
  sectionLabel: {
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 2,
    color: colors.inkLight,
  },
  list: { padding: spacing.md },
  card: {
    borderWidth: borderWidth,
    borderColor: colors.rule,
    marginBottom: spacing.sm,
    padding: spacing.md,
  },
  cardContent:  { flexDirection: "row", alignItems: "center" },
  address:      { fontFamily: fonts.sansRegular, fontSize: 15, color: colors.ink },
  meta:         { fontFamily: fonts.mono, fontSize: 11, color: colors.inkLight, marginTop: 2 },
  scoreCol:     { alignItems: "center", marginLeft: spacing.md },
  scoreNum:     { fontFamily: fonts.serif, fontSize: 28, color: colors.ink, lineHeight: 34 },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 2,
  },
  badgeText: { fontFamily: fonts.mono, fontSize: 11, color: colors.paper, letterSpacing: 1 },
  empty: { fontFamily: fonts.sans, fontSize: 14, color: colors.inkLight, textAlign: "center", marginTop: spacing.xl },
});
