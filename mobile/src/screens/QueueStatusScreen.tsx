import React from "react";
import { View, Text, FlatList, Pressable, StyleSheet } from "react-native";
import { colors, fonts, spacing } from "../theme";
import type { QueuedOperation } from "../services/offlineQueue";

interface Props {
  items:     QueuedOperation[];
  onRetry:   (id: string) => void;
  onDiscard: (id: string) => void;
}

const TYPE_LABEL: Record<string, string> = {
  addBill:     "Add Bill",
  createJob:   "Log Job",
  uploadPhoto: "Upload Photo",
};

/** "Log Job · Replaced water heater" when the payload says what it is. */
function itemLabel(item: QueuedOperation): string {
  const base = TYPE_LABEL[item.type] ?? item.type;
  const what = (item.payload as { description?: unknown } | null)?.description;
  return typeof what === "string" && what.trim() ? `${base} · ${what.trim()}` : base;
}

export default function QueueStatusScreen({ items, onRetry, onDiscard }: Props) {
  const failedCount = items.filter((i) => i.status === "failed").length;

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>OFFLINE QUEUE</Text>

      {items.length > 0 && failedCount > 0 && (
        <Text style={styles.summary}>{failedCount} failed — action required</Text>
      )}

      {items.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Queue empty</Text>
          <Text style={styles.emptySubtext}>All writes have been synced.</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={styles.rowInfo}>
                <Text style={styles.rowType} numberOfLines={1}>{itemLabel(item)}</Text>
                <Text style={[styles.rowStatus, item.status === "failed" && styles.failedStatus]}>
                  {item.status === "pending" ? "pending · sends when you're online" : "failed"}
                </Text>
                {item.failReason ? (
                  <Text style={styles.rowReason} numberOfLines={2}>{item.failReason}</Text>
                ) : null}
              </View>
              {item.status === "failed" && (
                <View style={styles.rowActions}>
                  <Pressable style={styles.retryBtn} onPress={() => onRetry(item.id)} accessibilityRole="button" accessibilityLabel={`Retry ${itemLabel(item)}`}>
                    <Text style={styles.retryBtnText}>Retry</Text>
                  </Pressable>
                  <Pressable style={styles.discardBtn} onPress={() => onDiscard(item.id)} accessibilityRole="button" accessibilityLabel={`Discard ${itemLabel(item)}`}>
                    <Text style={styles.discardBtnText}>Discard</Text>
                  </Pressable>
                </View>
              )}
            </View>
          )}
          contentContainerStyle={styles.list}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.paper,
    padding: spacing.lg,
  },
  heading: {
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 1.5,
    color: colors.inkLight,
    marginBottom: spacing.md,
  },
  summary: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: "#B45309",
    marginBottom: spacing.sm,
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    fontFamily: fonts.mono,
    fontSize: 16,
    color: colors.ink,
    marginBottom: 4,
  },
  emptySubtext: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.inkLight,
  },
  list: {
    gap: 8,
  },
  row: {
    borderWidth: 1,
    borderColor: colors.rule,
    padding: spacing.sm,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  rowInfo: {
    flex: 1,
  },
  rowType: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: colors.ink,
  },
  rowStatus: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.inkLight,
    letterSpacing: 0.5,
    marginTop: 2,
  },
  failedStatus: {
    color: "#B45309",
  },
  rowReason: {
    fontFamily: fonts.sans,
    fontSize: 11,
    color: colors.inkLight,
    marginTop: 2,
  },
  rowActions: {
    flexDirection: "row",
    gap: 8,
    marginLeft: spacing.sm,
  },
  retryBtn: {
    borderWidth: 1,
    borderColor: colors.ink,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  retryBtnText: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.ink,
    letterSpacing: 0.5,
  },
  discardBtn: {
    borderWidth: 1,
    borderColor: colors.rule,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  discardBtnText: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.inkLight,
    letterSpacing: 0.5,
  },
});
