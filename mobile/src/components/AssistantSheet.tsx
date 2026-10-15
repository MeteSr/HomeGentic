import React, { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Pressable, Text, TextInput, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useAppData } from "../context/AppData";
import { useAssistant } from "../hooks/useAssistant";
import { loadContractorContext, loadHomeownerContext } from "../services/agentContext";
import { usageMeterLabel } from "../services/agentService";
import { Icon } from "./Icon";
import { CloseButton, Kicker, Pill, Sheet } from "./ui";
import { family, shadow, type, v3 } from "../theme";

export interface Prompt {
  id:      string;
  q:       string;
  source:  string;
  action:  string;
  /** Where the action button goes. */
  go:      { tab: string } | { screen: string } | { sheet: "props" };
}

export function promptsFor(contractor: boolean, pro: boolean): Prompt[] {
  if (contractor) {
    return [
      { id: "leads", q: "Which new leads fit my trades?",         source: "SOURCE: LEADS",              action: "Open leads",   go: { tab: "Leads" } },
      { id: "sigs",  q: "What's waiting on my signature?",         source: "SOURCE: PENDING SIGNATURES", action: "Sign now",     go: { tab: "Sign" } },
      { id: "fees",  q: "How much did I pay in fees this month?",  source: "SOURCE: EARNINGS",           action: "See earnings", go: { tab: "Earnings" } },
    ];
  }
  return [
    { id: "score", q: "What's dragging my score down?",   source: "SOURCE: SCORE BREAKDOWN", action: "Open jobs",   go: { tab: "Jobs" } },
    { id: "next",  q: "What maintenance is coming up?",    source: "SOURCE: UPKEEP SCHEDULE", action: "Open upkeep", go: { tab: "Upkeep" } },
    pro
      ? { id: "plan", q: "Can I add my rental to this account?", source: "SOURCE: ACCOUNT · PRO PLAN",  action: "Add a property", go: { sheet: "props" } }
      : { id: "plan", q: "Can I add my rental to this account?", source: "SOURCE: ACCOUNT · FREE PLAN", action: "See Pro",        go: { screen: "Upgrade" } },
  ];
}

const WAVES = [10, 18, 26, 14, 22, 8, 16, 24, 12];

function Waveform({ live }: { live: boolean }) {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!live) { pulse.setValue(1); return; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 0.45, duration: 420, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1, duration: 420, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [live, pulse]);
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 4, height: 26, marginTop: 16 }} accessibilityElementsHidden>
      {WAVES.map((h, i) => (
        <Animated.View
          key={i}
          style={{
            width: 4, height: h, borderRadius: 100, backgroundColor: v3.blueLine,
            transform: [{ scaleY: live ? pulse.interpolate({ inputRange: [0.45, 1], outputRange: i % 2 ? [1, 0.45] : [0.45, 1] }) : 1 }],
          }}
        />
      ))}
    </View>
  );
}

export function AssistantSheet() {
  const app = useAppData();
  const navigation = useNavigation<any>();
  const [text, setText] = useState("");
  const [asked, setAsked] = useState<Prompt | null>(null);
  const inputRef = useRef<TextInput>(null);

  const buildContext = useCallback(
    () => app.contractor ? loadContractorContext(app.tier, app.limits) : loadHomeownerContext(app.activeProperty, app.tier, app.limits),
    [app.contractor, app.tier, app.limits, app.activeProperty],
  );
  const assistant = useAssistant(buildContext, app.refreshUsage);

  useEffect(() => { if (app.askOpen) app.refreshUsage(); }, [app.askOpen]);   // eslint-disable-line react-hooks/exhaustive-deps

  const close = () => { app.closeAsk(); assistant.reset(); setAsked(null); setText(""); };
  const prompts = promptsFor(app.contractor, app.pro);
  const noAgent = app.limits.agentCalls === 0;   // Contractor Free has no assistant calls
  const outOfCalls = !!app.usage && app.usage.limit > 0 && app.usage.used >= app.usage.limit;

  function ask(q: string, prompt: Prompt | null) {
    setAsked(prompt);
    setText("");
    assistant.ask(q);
  }

  function act() {
    const go = asked?.go;
    close();
    if (!go) return;
    if ("tab" in go) navigation.navigate("Tabs", { screen: go.tab });
    else if ("screen" in go) navigation.navigate(go.screen);
    else app.openProps();
  }

  const state = assistant.status === "thinking" ? "THINKING" : assistant.status === "answered" ? "ANSWERED" : assistant.status === "error" ? "TRY AGAIN" : "READY";
  const dot   = assistant.status === "answered" ? v3.blue : assistant.status === "thinking" ? v3.yellow : assistant.status === "error" ? v3.red : v3.muted;

  return (
    <Sheet visible={app.askOpen} onClose={close}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
          <View style={{ width: 8, height: 8, borderRadius: 100, backgroundColor: dot }} />
          <Kicker>{state}</Kicker>
        </View>
        <CloseButton onPress={close} />
      </View>

      {assistant.status === "idle" ? (
        <>
          <Text style={{ fontFamily: family.display, fontSize: 24, lineHeight: 27.8, letterSpacing: -0.72, color: v3.ink, marginTop: 18 }}>
            {app.contractor ? "Ask about your leads and jobs." : `Ask about ${app.activeProperty?.street ?? "your home"}.`}
          </Text>
          <Text style={[type.body, { fontSize: 13, lineHeight: 20.8, marginTop: 9 }]}>
            {app.contractor
              ? "The assistant reads your leads, signatures and earnings. It asks before sending a bid."
              : "The assistant reads your records, jobs and schedule. It asks before acting on anything."}
          </Text>
          {app.usage && app.usage.limit > 0 && (
            <Text style={[type.meta, { fontSize: 11, lineHeight: 15.4, marginTop: 10 }]}>{usageMeterLabel(app.usage, !app.pro)}</Text>
          )}
          {noAgent ? (
            <View style={{ backgroundColor: v3.yellowTint, borderWidth: 1, borderColor: v3.yellow, borderRadius: 20, padding: 18, marginTop: 18 }}>
              <Text style={{ fontFamily: family.body, fontSize: 13, lineHeight: 20.2, color: v3.ink }}>
                The assistant is part of Contractor Pro, $40 a month on homegentic.app.
              </Text>
              <Pill label="See Contractor Pro" variant="ink" style={{ marginTop: 14 }} onPress={() => { close(); navigation.navigate("Upgrade"); }} />
            </View>
          ) : (
            <View style={{ gap: 9, marginTop: 18 }}>
              {prompts.map((p) => (
                <Pressable
                  key={p.id}
                  onPress={() => ask(p.q, p)}
                  disabled={outOfCalls}
                  accessibilityRole="button"
                  style={({ pressed }) => ({
                    minHeight: 44, justifyContent: "center", backgroundColor: v3.field, borderWidth: 1, borderColor: v3.line,
                    borderRadius: 16, paddingVertical: 13, paddingHorizontal: 15, opacity: outOfCalls ? 0.5 : pressed ? 0.8 : 1,
                  })}
                >
                  <Text style={{ fontFamily: family.bodyMedium, fontSize: 13.5, lineHeight: 18.9, color: v3.ink }}>{p.q}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </>
      ) : (
        <>
          <Text style={{ fontFamily: family.display, fontSize: 21, lineHeight: 25.2, letterSpacing: -0.63, color: v3.ink, marginTop: 18 }}>
            {assistant.question}
          </Text>
          <Waveform live={assistant.status === "thinking"} />
          <View style={[{ backgroundColor: v3.surface, borderWidth: 1, borderColor: v3.line, borderRadius: 20, padding: 18, marginTop: 16 }, shadow]}>
            <Text style={{ fontFamily: family.body, fontSize: 14, lineHeight: 22.4, color: v3.ink }}>
              {assistant.status === "thinking" ? "Reading your records…" : assistant.status === "error" ? assistant.error : assistant.answer}
            </Text>
            {assistant.status === "answered" && (
              <Text style={[type.meta, { fontSize: 11, lineHeight: 16.5, marginTop: 12 }]}>{asked?.source ?? "SOURCE: YOUR HOMEGENTIC RECORD"}</Text>
            )}
            {assistant.status !== "thinking" && (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 9, marginTop: 16 }}>
                {assistant.status === "answered" && asked && <Pill label={asked.action} onPress={act} />}
                {assistant.status === "error" && assistant.question && (
                  <Pill label="Try again" onPress={() => assistant.ask(assistant.question!)} />
                )}
                <Pill label="Ask something else" variant="outline" onPress={() => { assistant.reset(); setAsked(null); }} />
              </View>
            )}
          </View>
        </>
      )}

      {!noAgent && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 18 }}>
          <TextInput
            ref={inputRef}
            value={text}
            onChangeText={setText}
            placeholder={outOfCalls ? "No AI calls left this period" : "Type a question"}
            placeholderTextColor={v3.muted}
            editable={!outOfCalls && assistant.status !== "thinking"}
            returnKeyType="send"
            onSubmitEditing={() => text.trim() && ask(text, null)}
            accessibilityLabel="Ask a question"
            style={{
              flex: 1, minHeight: 48, borderRadius: 100, backgroundColor: v3.lineSoft, borderWidth: 1, borderColor: v3.line,
              paddingVertical: 13, paddingHorizontal: 18, fontFamily: family.body, fontSize: 14, color: v3.ink,
            }}
          />
          <Pressable
            onPress={() => (text.trim() ? ask(text, null) : inputRef.current?.focus())}
            disabled={outOfCalls || assistant.status === "thinking"}
            accessibilityRole="button"
            accessibilityLabel={text.trim() ? "Send question" : "Type a question"}
            style={{ width: 48, height: 48, borderRadius: 100, backgroundColor: v3.ink, alignItems: "center", justifyContent: "center", opacity: outOfCalls ? 0.5 : 1 }}
          >
            <Icon name={text.trim() ? "send" : "mic"} size={19} color={v3.paper} strokeWidth={text.trim() ? 2.4 : 2} />
          </Pressable>
        </View>
      )}
    </Sheet>
  );
}
