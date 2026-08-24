import React, { createContext, useContext, useEffect, useState } from "react";
import { useParams, Outlet } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { propertyService } from "@/services/property";
import type { VerifyClaimData, VerifyContextValue } from "./types";
import { V2_COLORS, V2_FONTS } from "@/theme";

const VerifyContext = createContext<VerifyContextValue | null>(null);

export function useVerifyContext(): VerifyContextValue {
  const ctx = useContext(VerifyContext);
  if (!ctx) throw new Error("useVerifyContext must be used inside VerifyLayout");
  return ctx;
}

export default function VerifyLayout() {
  const { id } = useParams<{ id: string }>();
  const [claim,   setClaim]   = useState<VerifyClaimData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const load = async () => {
    if (!id) return;
    try {
      setError(null);
      const data = await propertyService.getVerifyStatus(id);
      setClaim(data);
    } catch (err: any) {
      setError(err?.message ?? "Failed to load verification status.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [id]);

  if (loading) {
    return (
      <Layout>
        <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ width: 40, height: 40, border: `3px solid ${V2_COLORS.border}`, borderTopColor: V2_COLORS.blue, borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 16px" }} />
            <p style={{ fontFamily: V2_FONTS.body, color: V2_COLORS.muted, fontSize: 14 }}>Loading verification status…</p>
          </div>
        </div>
      </Layout>
    );
  }

  if (error || !claim) {
    return (
      <Layout>
        <div style={{ maxWidth: 480, margin: "4rem auto", padding: "0 24px", textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>⚠️</div>
          <h2 style={{ fontFamily: V2_FONTS.display, fontSize: 22, fontWeight: 700, color: V2_COLORS.ink, marginBottom: 8 }}>
            Could not load verification
          </h2>
          <p style={{ fontFamily: V2_FONTS.body, color: V2_COLORS.muted, fontSize: 14, marginBottom: 24 }}>
            {error ?? "Property not found."}
          </p>
          <button
            onClick={() => { setLoading(true); load(); }}
            style={{ background: V2_COLORS.blue, color: "#fff", border: "none", borderRadius: 100, padding: "10px 24px", fontFamily: V2_FONTS.body, fontSize: 14, fontWeight: 600, cursor: "pointer" }}
          >
            Try again
          </button>
        </div>
      </Layout>
    );
  }

  return (
    <VerifyContext.Provider value={{ claim, refresh: load }}>
      <Outlet />
    </VerifyContext.Provider>
  );
}
