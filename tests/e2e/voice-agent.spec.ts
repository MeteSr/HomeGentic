import { test, expect } from "@playwright/test";
import { injectTestAuth } from "./helpers/auth";
import { injectTestProperties } from "./helpers/testData";

/**
 * Injects a minimal SpeechRecognition mock so the voice agent UI renders
 * (it returns `isSupported = true`) and we can programmatically trigger
 * transcript + final result events without real mic access.
 */
async function injectSpeechMock(page: Parameters<typeof injectTestAuth>[0]) {
  await page.addInitScript(() => {
    const listeners: Record<string, EventListener[]> = {};

    class MockSpeechRecognition {
      continuous    = false;
      interimResults = false;
      lang           = "";

      addEventListener(type: string, fn: EventListener) {
        listeners[type] = listeners[type] ?? [];
        listeners[type].push(fn);
      }
      removeEventListener() {}

      start() {
        // Immediately fire a result with "what systems need replacing"
        setTimeout(() => {
          const resultEvent = {
            resultIndex: 0,
            results: [{
              0: { transcript: "what systems need replacing", confidence: 0.95 },
              isFinal: true,
              length:  1,
            }],
          };
          (listeners["result"] ?? []).forEach((fn) => fn(resultEvent as any));

          // Fire end after result
          setTimeout(() => {
            (listeners["end"] ?? []).forEach((fn) => fn({} as any));
          }, 50);
        }, 100);
      }

      stop() {}
      abort() {}
    }

    (window as any).SpeechRecognition = MockSpeechRecognition;
    (window as any).webkitSpeechRecognition = MockSpeechRecognition;
    // Also stub SpeechSynthesis so it doesn't error
    (window as any).speechSynthesis = { speak: () => {}, cancel: () => {}, getVoices: () => [] };
  });
}

/**
 * Mocks the /api/agent endpoint on the voice proxy server.
 */
function mockAgentEndpoint(page: Parameters<typeof injectTestAuth>[0], response: object) {
  return page.route("**/api/agent", (route) =>
    route.fulfill({
      status:      200,
      contentType: "application/json",
      body:        JSON.stringify(response),
    })
  );
}

test.describe("VoiceAgent — floating mic widget", () => {
  test.beforeEach(async ({ page }) => {
    await injectTestAuth(page);
    await injectTestProperties(page);
    await injectSpeechMock(page);
  });

  // ── Mic button presence ───────────────────────────────────────────────────

  test("shows the mic button on the dashboard", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("button", { name: /ask homefax/i })).toBeVisible();
  });

  test("shows the mic button on the maintenance page", async ({ page }) => {
    await page.goto("/maintenance");
    await expect(page.getByRole("button", { name: /ask homefax/i })).toBeVisible();
  });

  test("mic button is initially in idle state (Mic icon)", async ({ page }) => {
    await page.goto("/dashboard");
    const btn = page.getByRole("button", { name: /ask homefax/i });
    await expect(btn).toBeVisible();
    await expect(btn).toBeEnabled();
  });

  // ── Image attachment button ───────────────────────────────────────────────

  test("shows paperclip / image attach button on the dashboard", async ({ page }) => {
    await page.goto("/dashboard");
    // The attach button sits below the mic and has aria-label or is a file input trigger
    const attachBtn = page.getByRole("button", { name: /attach|paperclip|image/i });
    await expect(attachBtn).toBeVisible();
  });

  // ── Voice interaction round-trip ──────────────────────────────────────────

  test("clicking mic starts listening and shows transcript", async ({ page }) => {
    await mockAgentEndpoint(page, { type: "answer", text: "Your HVAC system is 23 years old and may need replacement." });
    await page.goto("/dashboard");

    const micBtn = page.getByRole("button", { name: /ask homefax/i });
    await micBtn.click();

    // The mock SpeechRecognition fires a transcript after 100ms
    // Mic should transition to listening → processing states
    await expect(page.getByRole("button", { name: /stop listening/i })).toBeVisible({ timeout: 500 });
  });

  test("agent response appears in the speech bubble", async ({ page }) => {
    await mockAgentEndpoint(page, {
      type: "answer",
      text: "Your HVAC system is 23 years old and may need replacement soon.",
    });
    await page.goto("/dashboard");

    const micBtn = page.getByRole("button", { name: /ask homefax/i });
    await micBtn.click();

    // Wait for agent response to appear in the bubble
    await expect(
      page.getByText(/HVAC system is 23 years old/i)
    ).toBeVisible({ timeout: 5000 });
  });

  test("speech bubble shows transcript (user utterance)", async ({ page }) => {
    await mockAgentEndpoint(page, { type: "answer", text: "Here are your replacement priorities." });
    await page.goto("/dashboard");

    await page.getByRole("button", { name: /ask homefax/i }).click();

    // Transcript is shown in italic in the bubble
    await expect(
      page.getByText(/what systems need replacing/i)
    ).toBeVisible({ timeout: 5000 });
  });

  test("Dismiss button closes the speech bubble", async ({ page }) => {
    await mockAgentEndpoint(page, { type: "answer", text: "All systems look good." });
    await page.goto("/dashboard");

    await page.getByRole("button", { name: /ask homefax/i }).click();
    await expect(page.getByText(/all systems look good/i)).toBeVisible({ timeout: 5000 });

    await page.getByRole("button", { name: /dismiss/i }).click();
    await expect(page.getByText(/all systems look good/i)).not.toBeVisible();
  });

  // ── Tool-call handling ────────────────────────────────────────────────────

  test("shows 'Working on it' message while tool calls are in flight", async ({ page }) => {
    // First response: tool call; second response: final answer
    let callCount = 0;
    await page.route("**/api/agent", (route) => {
      callCount++;
      if (callCount === 1) {
        route.fulfill({
          status:      200,
          contentType: "application/json",
          body: JSON.stringify({
            type:             "tool_calls",
            toolCalls:        [{ id: "tc1", name: "get_maintenance_forecast", input: {} }],
            assistantMessage: { role: "assistant", content: [] },
          }),
        });
      } else {
        route.fulfill({
          status:      200,
          contentType: "application/json",
          body: JSON.stringify({ type: "answer", text: "Based on the forecast, HVAC is critical." }),
        });
      }
    });

    // Also stub the maintenance forecast tool
    await page.route("**/api/maintenance-forecast**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ criticalSystems: [] }) })
    );

    await page.goto("/dashboard");
    await page.getByRole("button", { name: /ask homefax/i }).click();

    await expect(page.getByText(/working on it/i)).toBeVisible({ timeout: 5000 });
  });

  // ── Agent history panel ───────────────────────────────────────────────────

  test("Agent History panel appears after a completed interaction", async ({ page }) => {
    await mockAgentEndpoint(page, { type: "answer", text: "Your roof is in good shape." });
    await page.goto("/dashboard");

    await page.getByRole("button", { name: /ask homefax/i }).click();
    await expect(page.getByText(/your roof is in good shape/i)).toBeVisible({ timeout: 5000 });

    // History panel should now appear
    await expect(page.getByText(/agent history/i)).toBeVisible();
  });
});

// ── AI Advisor text chat (maintenance page) ───────────────────────────────────

test.describe("AI Advisor chat — /maintenance", () => {
  test.beforeEach(async ({ page }) => {
    await injectTestAuth(page);
    await injectTestProperties(page);
    await page.goto("/maintenance");
    await page.getByRole("button", { name: /ai advisor/i }).click();
    await expect(page.getByText(/HomeFax Maintenance Advisor/i)).toBeVisible();
  });

  test("shows initial greeting message", async ({ page }) => {
    await expect(page.getByText(/Ask me anything about your home systems/i)).toBeVisible();
  });

  test("shows a text input or mic trigger in the advisor tab", async ({ page }) => {
    // The AI Advisor renders the VoiceAgent or a dedicated text input
    const hasTextInput = await page.getByRole("textbox").count();
    const hasMicBtn    = await page.getByRole("button", { name: /ask homefax/i }).count();
    expect(hasTextInput + hasMicBtn).toBeGreaterThan(0);
  });
});
