import React, { useRef, useEffect, useState } from "react";
import { photoService } from "@/services/photo";

export interface PanoramaEntry {
  roomLabel: string;
  photoId:   string;
}

interface Props {
  panoramas:    PanoramaEntry[];
  propertyId:   string;
  initialRoom?: string;
}

const S = {
  wrapper: {
    fontFamily: "'Hanken Grotesk', sans-serif",
  } as React.CSSProperties,
  canvasWrap: {
    position: "relative" as const,
    width:    "100%",
    height:   480,
    background: "#0e0e0c",
    overflow:   "hidden",
  } as React.CSSProperties,
  canvas: {
    width:  "100%",
    height: "100%",
    display: "block",
  } as React.CSSProperties,
  roomLabel: {
    fontFamily:    "'JetBrains Mono', monospace",
    fontSize:      "0.72rem",
    letterSpacing: "0.06em",
    textTransform: "uppercase" as const,
    color:         "#f4f1eb",
    padding:       "0.5rem 1rem",
    background:    "rgba(14,14,12,0.7)",
    position:      "absolute" as const,
    bottom:        8,
    left:          8,
  },
  nav: {
    display:   "flex",
    gap:       "0.5rem",
    flexWrap:  "wrap" as const,
    padding:   "0.75rem 0",
  },
  navBtn: (active: boolean): React.CSSProperties => ({
    fontFamily:    "'JetBrains Mono', monospace",
    fontSize:      "0.68rem",
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    padding:       "0.3rem 0.75rem",
    border:        active ? "1px solid #0e0e0c" : "1px solid #c8c3b8",
    background:    active ? "#0e0e0c"           : "transparent",
    color:         active ? "#f4f1eb"           : "#0e0e0c",
    cursor:        "pointer",
  }),
  fallback: {
    padding:    "2rem",
    textAlign:  "center" as const,
    background: "#f4f1eb",
    border:     "1px solid #c8c3b8",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize:   "0.8rem",
    color:      "#7a7268",
  },
};

// Load a blob URL into a PlayCanvas texture and apply it as the material's
// emissive map, then force a material update so the sphere re-renders.
function applyTexture(pc: any, mat: any, url: string | undefined) {
  if (!url) return;
  const img = new Image();
  img.onload = () => {
    const tex = new pc.Texture(mat.device ?? pc.Application.getApplication()?.graphicsDevice, {
      width:  img.naturalWidth,
      height: img.naturalHeight,
      format: pc.PIXELFORMAT_SRGBA8,
    });
    tex.setSource(img);
    mat.emissiveMap = tex;
    mat.update();
    URL.revokeObjectURL(url);
  };
  img.src = url;
}

export default function PlayCanvas360Viewer({ panoramas, propertyId, initialRoom }: Props) {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const appRef       = useRef<any>(null);
  const sphereRef    = useRef<any>(null);
  // photoId → blob URL, populated once on mount
  const photoUrlsRef = useRef<Map<string, string>>(new Map());
  const [activeRoom, setActiveRoom] = useState<string>(
    () => initialRoom ?? (panoramas[0]?.roomLabel ?? "")
  );
  const [noWebGL, setNoWebGL] = useState(false);

  // Update active room when panoramas/initialRoom change externally
  useEffect(() => {
    if (panoramas.length > 0 && !panoramas.some((p) => p.roomLabel === activeRoom)) {
      setActiveRoom(panoramas[0].roomLabel);
    }
  }, [panoramas]);

  useEffect(() => {
    if (!panoramas.length || !canvasRef.current) return;

    // Detect WebGL availability before handing off to PlayCanvas
    const testCtx = canvasRef.current.getContext("webgl") ?? canvasRef.current.getContext("experimental-webgl");
    if (!testCtx) {
      setNoWebGL(true);
      return;
    }

    let destroyed = false;

    (async () => {
      try {
        // Pre-fetch all listing photos and build photoId → blob URL map
        const photos = await photoService.getListingPhotos(propertyId);
        for (const p of photos) {
          photoUrlsRef.current.set(p.id, p.url);
        }

        const pc = await import("playcanvas");

        if (destroyed || !canvasRef.current) return;

        const app = new pc.Application(canvasRef.current, {});
        app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
        app.setCanvasResolution(pc.RESOLUTION_AUTO);
        appRef.current = app;

        // Sky-sphere — equirectangular photo on the inner face (CULLFACE_FRONT)
        const sphere = new pc.Entity("sky");
        sphere.addComponent("render", { type: "sphere" });
        app.scene.root?.addChild(sphere);
        sphere.setLocalPosition(0, 0, 0);
        sphere.setLocalScale(100, 100, 100);
        sphereRef.current = sphere;

        // Material — emissive so the image is visible without lighting
        const mat = new pc.StandardMaterial();
        mat.cull = pc.CULLFACE_FRONT;
        mat.useLighting = false;
        (sphere.render as any).meshInstances[0].material = mat;

        // Camera placed at origin (inside the sphere)
        const camera = new pc.Entity("camera");
        camera.addComponent("camera", { clearColor: new pc.Color(0, 0, 0) });
        app.scene.root?.addChild(camera);
        camera.setLocalPosition(0, 0, 0);

        app.start();

        // Apply initial room texture after PlayCanvas is ready
        const initial = panoramas.find(p => p.roomLabel === activeRoom) ?? panoramas[0];
        if (initial) applyTexture(pc, mat, photoUrlsRef.current.get(initial.photoId));
      } catch {
        // PlayCanvas init failure (e.g. in test environment) — silently skip
      }
    })();

    return () => {
      destroyed = true;
      sphereRef.current = null;
      if (appRef.current) {
        try { appRef.current.destroy(); } catch { /* ignore */ }
        appRef.current = null;
      }
    };
  }, []);

  // Swap texture when active room changes
  useEffect(() => {
    if (!appRef.current || !sphereRef.current) return;
    const entry = panoramas.find(p => p.roomLabel === activeRoom);
    if (!entry) return;
    import("playcanvas").then(pc => {
      const mat = (sphereRef.current.render as any)?.meshInstances?.[0]?.material;
      if (mat) applyTexture(pc, mat, photoUrlsRef.current.get(entry.photoId));
    }).catch(() => {});
  }, [activeRoom, panoramas]);

  if (!panoramas.length) {
    return (
      <div data-testid="viewer-360-fallback" style={S.fallback}>
        No 360° tour available for this listing.
      </div>
    );
  }

  return (
    <div style={S.wrapper} data-testid="viewer-360">
      <section
        role="region"
        aria-label="360° Virtual Tour"
        style={S.canvasWrap}
      >
        {noWebGL ? (
          <div
            data-testid="viewer-360-no-webgl"
            style={{ ...S.fallback, height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            WebGL is not supported in your browser. Upgrade your browser to view the 360° tour.
          </div>
        ) : (
          <canvas ref={canvasRef} style={S.canvas} />
        )}

        <div data-testid="viewer-current-room" style={S.roomLabel}>
          {activeRoom}
        </div>
      </section>

      {panoramas.length > 1 && (
        <nav aria-label="Rooms" style={S.nav}>
          {panoramas.map((p) => (
            <button
              key={p.roomLabel}
              onClick={() => setActiveRoom(p.roomLabel)}
              aria-pressed={p.roomLabel === activeRoom}
              style={S.navBtn(p.roomLabel === activeRoom)}
            >
              {p.roomLabel}
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}
