/**
 * TDD tests for PlayCanvas360Viewer — Issue #308, Phase 1
 *
 * Tests the React wrapper for the 360° panorama viewer:
 *   - Renders container and accessible region
 *   - Shows current room name
 *   - Shows navigation buttons for other rooms
 *   - Clicking navigation switches the active room
 *   - Graceful fallback when no panoramas provided
 *   - Graceful fallback when WebGL is unavailable
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock photo service — no real canister in unit tests
vi.mock("@/services/photo", () => ({
  photoService: {
    getListingPhotos: vi.fn().mockResolvedValue([
      { id: "PH_1", url: "blob:http://localhost/ph1" },
      { id: "PH_2", url: "blob:http://localhost/ph2" },
      { id: "PH_3", url: "blob:http://localhost/ph3" },
    ]),
  },
}));

// Mock PlayCanvas — WebGL not available in jsdom
vi.mock("playcanvas", () => {
  const meshInst = { material: null };
  const mockRender = { meshInstances: [meshInst] };
  const mockEntity = {
    addComponent: vi.fn().mockReturnValue(mockRender),
    setLocalPosition: vi.fn(),
    setLocalScale: vi.fn(),
    setLocalEulerAngles: vi.fn(),
    render: mockRender,
    name: "",
  };
  return {
    Application:   vi.fn().mockReturnValue({ start: vi.fn(), scene: { root: { addChild: vi.fn() } }, setCanvasFillMode: vi.fn(), setCanvasResolution: vi.fn(), on: vi.fn(), destroy: vi.fn(), graphicsDevice: {} }),
    FILLMODE_FILL_WINDOW: "FILLMODE_FILL_WINDOW",
    RESOLUTION_AUTO:      "RESOLUTION_AUTO",
    Entity:  vi.fn().mockReturnValue(mockEntity),
    Color:   vi.fn(),
    Vec3:    vi.fn(),
    Texture: vi.fn(),
    StandardMaterial: vi.fn().mockReturnValue({ cull: 0, useLighting: true, emissiveMap: null, update: vi.fn() }),
    CULLFACE_FRONT: 1,
    PIXELFORMAT_SRGBA8: "PIXELFORMAT_SRGBA8",
    TEXTURETYPE_RGBM: "TEXTURETYPE_RGBM",
    PIXELFORMAT_R8_G8_B8_A8: "PIXELFORMAT_R8_G8_B8_A8",
  };
});

import PlayCanvas360Viewer, { type PanoramaEntry } from "@/components/PlayCanvas360Viewer";

const ROOMS: PanoramaEntry[] = [
  { roomLabel: "Living Room", photoId: "PH_1" },
  { roomLabel: "Kitchen",     photoId: "PH_2" },
  { roomLabel: "Master Bedroom", photoId: "PH_3" },
];

const TEST_PROPERTY_ID = "prop-test-001";

function renderViewer(panoramas = ROOMS) {
  return render(<PlayCanvas360Viewer panoramas={panoramas} propertyId={TEST_PROPERTY_ID} />);
}

// ─── Container and accessibility ──────────────────────────────────────────────

describe("PlayCanvas360Viewer — container and accessibility", () => {
  it("renders the viewer container with data-testid", () => {
    renderViewer();
    expect(screen.getByTestId("viewer-360")).toBeInTheDocument();
  });

  it("viewer region has an accessible label", () => {
    renderViewer();
    expect(
      screen.getByRole("region", { name: /360.*virtual tour|virtual tour/i })
    ).toBeInTheDocument();
  });

  it("renders a canvas element for the 3D scene", () => {
    renderViewer();
    const container = screen.getByTestId("viewer-360");
    expect(container.querySelector("canvas")).toBeInTheDocument();
  });
});

// ─── Room display ─────────────────────────────────────────────────────────────

describe("PlayCanvas360Viewer — room display", () => {
  it("shows the first room name by default", () => {
    renderViewer();
    expect(screen.getByTestId("viewer-current-room")).toHaveTextContent("Living Room");
  });

  it("accepts an initialRoom prop to start on a specific room", () => {
    render(<PlayCanvas360Viewer panoramas={ROOMS} propertyId={TEST_PROPERTY_ID} initialRoom="Kitchen" />);
    expect(screen.getByTestId("viewer-current-room")).toHaveTextContent("Kitchen");
  });
});

// ─── Navigation ───────────────────────────────────────────────────────────────

describe("PlayCanvas360Viewer — room navigation", () => {
  it("renders a navigation button for each room", () => {
    renderViewer();
    const nav = screen.getByRole("navigation", { name: /rooms/i });
    expect(nav.querySelectorAll("button")).toHaveLength(ROOMS.length);
  });

  it("each navigation button shows the room label", () => {
    renderViewer();
    expect(screen.getByRole("button", { name: /living room/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /kitchen/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /master bedroom/i })).toBeInTheDocument();
  });

  it("active room button has aria-pressed=true", () => {
    renderViewer();
    const btn = screen.getByRole("button", { name: /living room/i });
    expect(btn).toHaveAttribute("aria-pressed", "true");
  });

  it("inactive room buttons have aria-pressed=false", () => {
    renderViewer();
    const btn = screen.getByRole("button", { name: /kitchen/i });
    expect(btn).toHaveAttribute("aria-pressed", "false");
  });

  it("clicking a navigation button updates the current room display", () => {
    renderViewer();
    fireEvent.click(screen.getByRole("button", { name: /kitchen/i }));
    expect(screen.getByTestId("viewer-current-room")).toHaveTextContent("Kitchen");
  });

  it("clicking a navigation button toggles aria-pressed states", () => {
    renderViewer();
    fireEvent.click(screen.getByRole("button", { name: /kitchen/i }));
    expect(screen.getByRole("button", { name: /kitchen/i })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /living room/i })).toHaveAttribute("aria-pressed", "false");
  });

  it("renders no navigation when only one room is provided", () => {
    render(<PlayCanvas360Viewer panoramas={[ROOMS[0]]} propertyId={TEST_PROPERTY_ID} />);
    expect(screen.queryByRole("navigation", { name: /rooms/i })).not.toBeInTheDocument();
  });
});

// ─── Fallback — no panoramas ──────────────────────────────────────────────────

describe("PlayCanvas360Viewer — empty state", () => {
  it("renders a fallback when panoramas array is empty", () => {
    render(<PlayCanvas360Viewer panoramas={[]} propertyId={TEST_PROPERTY_ID} />);
    expect(screen.getByTestId("viewer-360-fallback")).toBeInTheDocument();
  });

  it("fallback message mentions no tour available", () => {
    render(<PlayCanvas360Viewer panoramas={[]} propertyId={TEST_PROPERTY_ID} />);
    expect(
      screen.getByText(/no 360.*tour|no virtual tour|tour not available/i)
    ).toBeInTheDocument();
  });

  it("does NOT render the canvas when there are no panoramas", () => {
    render(<PlayCanvas360Viewer panoramas={[]} propertyId={TEST_PROPERTY_ID} />);
    expect(screen.queryByRole("region", { name: /360.*virtual tour/i })).not.toBeInTheDocument();
  });
});

// ─── Fallback — WebGL unavailable ─────────────────────────────────────────────

describe("PlayCanvas360Viewer — WebGL unavailable fallback", () => {
  let _originalGetContext: typeof HTMLCanvasElement.prototype.getContext;

  beforeEach(() => {
    _originalGetContext = HTMLCanvasElement.prototype.getContext;
    // @ts-ignore — simulating no-WebGL environment
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue(null);
  });

  afterEach(() => {
    HTMLCanvasElement.prototype.getContext = _originalGetContext;
  });

  it("shows a no-WebGL fallback message when WebGL context is unavailable", () => {
    renderViewer();
    expect(screen.getByTestId("viewer-360-no-webgl")).toBeInTheDocument();
  });

  it("fallback mentions WebGL or browser support", () => {
    renderViewer();
    expect(
      screen.getByText(/webgl|3d not supported|upgrade your browser/i)
    ).toBeInTheDocument();
  });
});
