import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, CheckCircle, Clock } from "lucide-react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/Button";
import { Badge } from "@/components/Badge";
import { quoteService, QuoteRequest, Quote } from "@/services/quote";
import { contractorService } from "@/services/contractor";
import toast from "react-hot-toast";

const S = {
  ink: "#0E0E0C", paper: "#F4F1EB", rule: "#C8C3B8",
  rust: "#C94C2E", inkLight: "#7A7268", sage: "#3D6B57",
  serif: "'Playfair Display', Georgia, serif" as const,
  mono:  "'IBM Plex Mono', monospace" as const,
};

export default function QuoteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [request,         setRequest]         = useState<QuoteRequest | null>(null);
  const [quotes,          setQuotes]          = useState<Quote[]>([]);
  const [contractorNames, setContractorNames] = useState<Record<string, string>>({});
  const [loading,         setLoading]         = useState(true);
  const [accepting,       setAccepting]       = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    Promise.all([quoteService.getRequest(id), quoteService.getQuotesForRequest(id)])
      .then(async ([req, qs]) => {
        setRequest(req ?? null);
        setQuotes(qs);
        // Look up contractor names in parallel
        const names: Record<string, string> = {};
        await Promise.all(qs.map(async (q) => {
          const profile = await contractorService.getContractor(q.contractor).catch(() => null);
          names[q.contractor] = profile?.name ?? null!;
        }));
        setContractorNames(names);
      })
      .finally(() => setLoading(false));
  }, [id]);

  const lowestAmount = quotes.length > 0 ? Math.min(...quotes.map((q) => q.amount)) : 0;

  const handleAccept = async (quoteId: string) => {
    setAccepting(quoteId);
    try {
      await quoteService.accept(quoteId);
      toast.success("Quote accepted! The contractor will be notified.");
      navigate("/dashboard");
    } catch (err: any) {
      toast.error(err.message || "Failed to accept quote");
    } finally {
      setAccepting(null);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div style={{ display: "flex", justifyContent: "center", padding: "4rem" }}>
          <div className="spinner-lg" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div style={{ maxWidth: "48rem", margin: "0 auto", padding: "2rem 1.5rem" }}>

        <button
          onClick={() => navigate(-1)}
          style={{ display: "flex", alignItems: "center", gap: "0.375rem", fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", color: S.inkLight, background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: "1.5rem" }}
        >
          <ArrowLeft size={14} /> Back
        </button>

        <div style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.18em", textTransform: "uppercase", color: S.rust, marginBottom: "0.5rem" }}>
          Quotes
        </div>
        <h1 style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "1.75rem", lineHeight: 1, marginBottom: "1.5rem" }}>
          Quote Responses
        </h1>

        {/* Request summary */}
        {request && (
          <div style={{ border: `1px solid ${S.rule}`, background: "#fff", padding: "1.25rem", marginBottom: "1.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem" }}>
              <div>
                <p style={{ fontWeight: 500, marginBottom: "0.25rem" }}>{request.serviceType}</p>
                <p style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.06em", color: S.inkLight, fontWeight: 300 }}>{request.description}</p>
              </div>
              <Badge variant={
                request.urgency === "low" ? "success"
                : request.urgency === "medium" ? "warning"
                : "error"
              }>{request.urgency}</Badge>
            </div>
          </div>
        )}

        {/* Quotes */}
        {quotes.length === 0 ? (
          <div style={{ border: `1px dashed ${S.rule}`, padding: "3rem", textAlign: "center" }}>
            <Clock size={36} color={S.rule} style={{ margin: "0 auto 1rem" }} />
            <p style={{ fontFamily: S.serif, fontWeight: 700, marginBottom: "0.375rem" }}>Waiting for quotes</p>
            <p style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.06em", color: S.inkLight }}>
              Typically receive 2–5 quotes within 24 hours.
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            <p style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", color: S.inkLight }}>
              {quotes.length} quote{quotes.length !== 1 ? "s" : ""} received
            </p>
            {quotes
              .sort((a, b) => a.amount - b.amount)
              .map((quote) => {
                const isLowest = quote.amount === lowestAmount;
                return (
                  <div key={quote.id} style={{ border: `1px solid ${isLowest ? S.sage : S.rule}`, background: "#fff", padding: "1.25rem", position: "relative" }}>
                    {isLowest && (
                      <div style={{
                        position: "absolute", top: "-1px", left: "1rem",
                        background: S.sage, color: "#fff",
                        fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase",
                        padding: "0.2rem 0.625rem",
                      }}>
                        Lowest Quote
                      </div>
                    )}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem", marginTop: isLowest ? "0.75rem" : 0 }}>
                      <div>
                        <p style={{ fontWeight: 500, marginBottom: "0.25rem" }}>
                        {contractorNames[quote.contractor] ?? `${quote.contractor.slice(0, 10)}…`}
                      </p>
                        <p style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.06em", color: S.inkLight }}>
                          <Clock size={11} style={{ display: "inline", marginRight: "0.25rem" }} />
                          {quote.timeline} day{quote.timeline !== 1 ? "s" : ""} to complete
                        </p>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <p style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "1.75rem", lineHeight: 1, color: isLowest ? S.sage : S.ink }}>
                          ${quote.amount.toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <Button
                      loading={accepting === quote.id}
                      onClick={() => handleAccept(quote.id)}
                      variant={isLowest ? "primary" : "outline"}
                      icon={<CheckCircle size={14} />}
                      style={{ width: "100%" }}
                    >
                      Accept This Quote
                    </Button>
                  </div>
                );
              })}
          </div>
        )}
      </div>
    </Layout>
  );
}
