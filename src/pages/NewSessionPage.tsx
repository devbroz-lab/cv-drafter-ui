import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { createSession, formatApiError, startSession, uploadSource, uploadTor } from "../lib/api";
import { upsertRecentSession } from "../lib/recentSessions";
import { Button, Card, Input, Label, Textarea } from "../components/ui";

export function NewSessionPage() {
  const { accessToken } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  const [targetFormat, setTargetFormat] = useState<"giz" | "world_bank">("giz");
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [torFile, setTorFile] = useState<File | null>(null);
  const [category, setCategory] = useState("");
  const [employer, setEmployer] = useState("");
  const [yearsWithFirm, setYearsWithFirm] = useState("");
  const [pageLimit, setPageLimit] = useState("4");
  const [jobDescription, setJobDescription] = useState("");
  const [recruiterComments, setRecruiterComments] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!accessToken) {
      toast("Not signed in.", "error");
      return;
    }
    if (!cvFile) {
      toast("Please choose a CV file (.docx or .pdf).", "error");
      return;
    }
    if (!torFile) {
      toast("Please choose a ToR file (.docx or .pdf).", "error");
      return;
    }
    setBusy(true);
    try {
      const sourceFilename = cvFile.name;
      const torFilename = torFile.name;
      const { session_id } = await createSession(accessToken, {
        target_format: targetFormat,
        source_filename: sourceFilename,
        tor_filename: torFilename,
        category: category || undefined,
        employer: employer || undefined,
        years_with_firm: yearsWithFirm || undefined,
        page_limit: pageLimit ? Number(pageLimit) : undefined,
        job_description: jobDescription || undefined,
        recruiter_comments: recruiterComments || undefined,
      });

      await uploadSource(accessToken, session_id, cvFile);
      await uploadTor(accessToken, session_id, torFile);
      await startSession(accessToken, session_id);

      upsertRecentSession({
        id: session_id,
        label: sourceFilename,
        targetFormat,
        updatedAt: new Date().toISOString(),
      });

      toast("Session started. Pipeline is running.");
      navigate(`/sessions/${session_id}`, { replace: true });
    } catch (err: unknown) {
      toast(formatApiError(err), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-text)]">New reformat</h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--color-text-muted)]">
          Create session, upload files, and start extraction in one flow.
        </p>
      </div>

      <Card className="p-5 md:p-7">
        <form onSubmit={onSubmit} className="space-y-7">
          <section className="space-y-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg)]/35 p-4 md:p-5">
            <div>
              <h2 className="text-sm font-semibold text-[var(--color-text)]">Session Setup</h2>
              <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                Choose format and upload required files.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="target-format">Donor format</Label>
              <select
                id="target-format"
                className="mt-1 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 text-sm text-[var(--color-text)] outline-none transition-all duration-150 focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/20"
                value={targetFormat}
                onChange={(e) => setTargetFormat(e.target.value as "giz" | "world_bank")}
              >
                <option value="giz">GIZ</option>
                <option value="world_bank">World Bank</option>
              </select>
            </div>

            <div className="sm:col-span-2">
              <Label htmlFor="cv-file">CV file (.docx / .pdf)</Label>
              <Input
                id="cv-file"
                className="mt-1 cursor-pointer"
                type="file"
                required
                accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={(e) => setCvFile(e.target.files?.[0] ?? null)}
              />
              <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                {cvFile ? `Selected: ${cvFile.name}` : "Required file"}
              </p>
            </div>

            <div className="sm:col-span-2">
              <Label htmlFor="tor-file">ToR file (.docx / .pdf)</Label>
              <Input
                id="tor-file"
                className="mt-1 cursor-pointer"
                type="file"
                required
                accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={(e) => setTorFile(e.target.files?.[0] ?? null)}
              />
              <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                {torFile ? `Selected: ${torFile.name}` : "Required file"}
              </p>
            </div>
            </div>
          </section>

          <section className="space-y-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg)]/35 p-4 md:p-5">
            <div>
              <h2 className="text-sm font-semibold text-[var(--color-text)]">Project Context</h2>
              <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                Add assignment details to improve output relevance.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="category">Category</Label>
              <Input
                id="category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Senior Expert"
              />
            </div>
            <div>
              <Label htmlFor="employer">Employer</Label>
              <Input id="employer" value={employer} onChange={(e) => setEmployer(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="years-with-firm">Years with firm</Label>
              <Input
                id="years-with-firm"
                value={yearsWithFirm}
                onChange={(e) => setYearsWithFirm(e.target.value)}
                placeholder="5"
              />
            </div>
            <div>
              <Label htmlFor="page-limit">Page limit (1–100)</Label>
              <Input
                id="page-limit"
                type="number"
                min={1}
                max={100}
                value={pageLimit}
                onChange={(e) => setPageLimit(e.target.value)}
              />
            </div>
            </div>
          </section>

          <section className="space-y-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg)]/35 p-4 md:p-5">
            <div>
              <h2 className="text-sm font-semibold text-[var(--color-text)]">Additional Notes</h2>
              <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                Provide useful context for mapping and writing quality.
              </p>
            </div>
            <div>
              <Label htmlFor="job-description">Job description</Label>
              <Textarea
                id="job-description"
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                placeholder="Paste key role expectations, scope, and must-have expertise."
                className="min-h-[120px]"
              />
            </div>

            <div>
              <Label htmlFor="recruiter-comments">Recruiter comments</Label>
              <Textarea
                id="recruiter-comments"
                value={recruiterComments}
                onChange={(e) => setRecruiterComments(e.target.value)}
                placeholder="Any constraints or emphasis for this submission."
                className="min-h-[110px]"
              />
            </div>
          </section>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-raised)]/60 p-3">
            <p className="text-xs text-[var(--color-text-muted)]">
              This will create a session, upload files, and start pipeline execution.
            </p>
            <Button type="submit" className="w-full sm:w-auto" disabled={busy}>
              {busy ? "Creating and starting…" : "Create & start pipeline"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
