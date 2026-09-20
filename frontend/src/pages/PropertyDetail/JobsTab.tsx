import { type Job } from "@/services/job";
import { Panel, Pill } from "@/components/hud";

export function JobsTab({ jobs }: { jobs: Job[] }) {
  if (jobs.length === 0) {
    return (
      <Panel style={{ border: "1px dashed var(--hg-line-2)", background: "transparent", padding: "3rem", textAlign: "center" }}>
        <p style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: "0.65rem", letterSpacing: "0.06em", color: "var(--hg-muted)" }}>No jobs found.</p>
      </Panel>
    );
  }

  return (
    <Panel style={{ overflow: "hidden" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--hg-line)" }}>
            {["Service", "Contractor", "Date", "Amount", "Status"].map((h) => (
              <th key={h} style={{ textAlign: "left", padding: "0.75rem 1rem", fontFamily: "'JetBrains Mono',monospace", fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--hg-muted)", fontWeight: 500 }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {jobs.map((job, i) => (
            <tr key={job.id} style={{ borderBottom: i < jobs.length - 1 ? "1px solid var(--hg-line)" : "none" }}>
              <td style={{ padding: "0.875rem 1rem", fontWeight: 500, fontSize: "0.875rem", color: "var(--hg-ink-2)" }}>{job.serviceType}</td>
              <td style={{ padding: "0.875rem 1rem", fontSize: "0.875rem", color: "var(--hg-muted)" }}>{job.isDiy ? "DIY" : job.contractorName}</td>
              <td style={{ padding: "0.875rem 1rem", fontFamily: "'JetBrains Mono',monospace", fontSize: "0.65rem", letterSpacing: "0.06em", color: "var(--hg-muted)" }}>{job.date}</td>
              <td style={{ padding: "0.875rem 1rem", fontFamily: "'JetBrains Mono',monospace", fontSize: "0.875rem", fontWeight: 500, color: "var(--hg-ink-2)" }}>${(job.amount / 100).toLocaleString()}</td>
              <td style={{ padding: "0.875rem 1rem" }}>
                <Pill tone={job.status === "verified" ? "good" : job.status === "completed" ? "info" : "warn"}>{job.status}</Pill>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}
