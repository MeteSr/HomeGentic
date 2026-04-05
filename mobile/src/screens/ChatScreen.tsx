import React, { useState, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { ChatStackParamList } from "../navigation/ChatStack";
import { useChatAgent, ChatMessage } from "../hooks/useChatAgent";
import { colors, fonts, spacing, borderWidth } from "../theme";

type Nav = NativeStackNavigationProp<ChatStackParamList, "Chat">;

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === "user";
  const isTool = msg.role === "tool";

  return (
    <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant]}>
      {isTool && (
        <Text style={styles.toolLabel}>WORKING</Text>
      )}
      <Text style={[styles.bubbleText, isUser ? styles.bubbleTextUser : styles.bubbleTextAssistant]}>
        {msg.text}
      </Text>
    </View>
  );
}

export default function ChatScreen() {
  const navigation = useNavigation<Nav>();
  const { messages, status, errorText, sendMessage, clearMessages } = useChatAgent();
  const [input, setInput] = useState("");
  const flatListRef = useRef<FlatList>(null);

  function handleSend() {
    const text = input.trim();
    if (!text) return;
    setInput("");
    sendMessage(text);
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={90}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerLabel}>ASK HOMEGENTIC</Text>
        <View style={{ flexDirection: "row", gap: spacing.md }}>
          <TouchableOpacity
            onPress={() => navigation.navigate("PropertyList")}
            accessibilityLabel="View properties"
          >
            <Text style={styles.headerAction}>PROPERTIES</Text>
          </TouchableOpacity>
          {messages.length > 0 && (
            <TouchableOpacity onPress={clearMessages} accessibilityLabel="Clear chat">
              <Text style={styles.headerAction}>CLEAR</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Message list */}
      {messages.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyHeading}>Your home's AI assistant.</Text>
          <Text style={styles.emptyHint}>
            Ask about maintenance, log a job, or get a quote.
          </Text>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(m) => m.id}
          renderItem={({ item }) => <MessageBubble msg={item} />}
          contentContainerStyle={styles.messageList}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        />
      )}

      {/* Error banner */}
      {errorText && (
        <Text style={styles.errorText}>{errorText}</Text>
      )}

      {/* Input row */}
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Ask anything about your home…"
          placeholderTextColor={colors.inkLight}
          returnKeyType="send"
          onSubmitEditing={handleSend}
          editable={status !== "thinking"}
          accessibilityLabel="Chat input"
          multiline={false}
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!input.trim() || status === "thinking") && styles.sendBtnDisabled]}
          onPress={handleSend}
          disabled={!input.trim() || status === "thinking"}
          accessibilityLabel="Send message"
          accessibilityRole="button"
        >
          {status === "thinking" ? (
            <ActivityIndicator color={colors.paper} size="small" />
          ) : (
            <Text style={styles.sendBtnText}>▶</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    borderBottomWidth: borderWidth,
    borderBottomColor: colors.rule,
  },
  headerLabel: {
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 2,
    color: colors.inkLight,
  },
  headerAction: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 1,
    color: colors.rust,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  emptyHeading: {
    fontFamily: fonts.serif,
    fontSize: 22,
    color: colors.ink,
    textAlign: "center",
    marginBottom: spacing.sm,
  },
  emptyHint: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.inkLight,
    textAlign: "center",
    lineHeight: 20,
  },
  messageList: {
    padding: spacing.md,
    paddingBottom: spacing.lg,
  },
  bubble: {
    marginBottom: spacing.sm,
    padding: spacing.md,
    maxWidth: "82%",
    borderWidth: borderWidth,
  },
  bubbleUser: {
    alignSelf: "flex-end",
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  bubbleAssistant: {
    alignSelf: "flex-start",
    backgroundColor: colors.paper,
    borderColor: colors.rule,
  },
  bubbleText: {
    fontSize: 15,
    lineHeight: 22,
  },
  bubbleTextUser: {
    fontFamily: fonts.sansRegular,
    color: colors.paper,
  },
  bubbleTextAssistant: {
    fontFamily: fonts.sans,
    color: colors.ink,
  },
  toolLabel: {
    fontFamily: fonts.mono,
    fontSize: 9,
    letterSpacing: 1.5,
    color: colors.inkLight,
    marginBottom: 4,
  },
  errorText: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.rust,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    textAlign: "center",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.sm,
    borderTopWidth: borderWidth,
    borderTopColor: colors.rule,
    backgroundColor: colors.paper,
  },
  input: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 15,
    color: colors.ink,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: borderWidth,
    borderColor: colors.rule,
    marginRight: spacing.sm,
    height: 44,
  },
  sendBtn: {
    width: 44,
    height: 44,
    backgroundColor: colors.rust,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: {
    backgroundColor: colors.rule,
  },
  sendBtnText: {
    color: colors.paper,
    fontSize: 16,
  },
});
