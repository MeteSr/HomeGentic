import React from "react";
import { Badge } from "@/components/Badge";
import { type Job } from "@/services/job";
import { COLORS, FONTS } from "@/theme";

export function JobsTab({ jobs }: { jobs: Job[] }) {
  const mono     = FONTS.mono;
  const rule     = COLORS.rule;
  const inkLight = COLORS.plumMid;

  if (jobs.length === 0) {
    return (
      <div style={{ border: `1px dashed ${rule}`, padding: "3rem", textAlign: "center" }}>
        <p style={{ fontFamily: mono, fontSize: "0.65rem", letterSpacing: "0.06em", color: inkLight }}>No jobs found.</p>
      </div>
    );
  }

  return (
    <div style={{ border: `1px solid ${rule}` }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${rule}` }}>
            {["Service", "Contractor", "Date", "Amount", "Status"].map((h) => (
              <th key={h} style={{ textAlign: "left", padding: "0.75rem 1rem", fontFamily: mono, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: inkLight, fontWeight: 500 }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {jobs.map((job, i) => (
            <tr key={job.id} style={{ borderBottom: i < jobs.length - 1 ? `1px solid ${rule}` : "none", background: "#fff" }}>
              <td style={{ padding: "0.875rem 1rem", fontWeight: 500, fontSize: "0.875rem" }}>{job.serviceType}</td>
              <td style={{ padding: "0.875rem 1rem", fontSize: "0.875rem", color: inkLight }}>{job.isDiy ? "DIY" : job.contractorName}</td>
              <td style={{ padding: "0.875rem 1rem", fontFamily: mono, fontSize: "0.65rem", letterSpacing: "0.06em", color: inkLight }}>{job.date}</td>
              <td style={{ padding: "0.875rem 1rem", fontFamily: mono, fontSize: "0.875rem", fontWeight: 500 }}>${(job.amount / 100).toLocaleString()}</td>
              <td style={{ padding: "0.875rem 1rem" }}>
                <Badge variant={job.status === "verified" ? "success" : job.status === "completed" ? "info" : "warning"} size="sm">{job.status}</Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
