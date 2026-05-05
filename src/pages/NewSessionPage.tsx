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
    setBusy(true);
    try {
      const sourceFilename = cvFile.name;
      const torFilename = torFile?.name ?? null;
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
      if (torFile) await uploadTor(accessToken, session_id, torFile);
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--color-text)]">New reformat</h1>
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">
          Create session, upload files, and start extraction in one flow.
        </p>
      </div>

      <Card>
        <form onSubmit={onSubmit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>Donor format</Label>
              <select
                className="mt-1 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text)]"
                value={targetFormat}
                onChange={(e) => setTargetFormat(e.target.value as "giz" | "world_bank")}
              >
                <option value="giz">GIZ</option>
                <option value="world_bank">World Bank</option>
              </select>
            </div>

            <div className="sm:col-span-2">
              <Label>CV file (.docx / .pdf)</Label>
              <Input
                className="mt-1 cursor-pointer"
                type="file"
                accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={(e) => setCvFile(e.target.files?.[0] ?? null)}
              />
            </div>

            <div className="sm:col-span-2">
              <Label>ToR file (optional)</Label>
              <Input
                className="mt-1 cursor-pointer"
                type="file"
                accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={(e) => setTorFile(e.target.files?.[0] ?? null)}
              />
            </div>

            <div>
              <Label>Category</Label>
              <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Senior Expert" />
            </div>
            <div>
              <Label>Employer</Label>
              <Input value={employer} onChange={(e) => setEmployer(e.target.value)} />
            </div>
            <div>
              <Label>Years with firm</Label>
              <Input value={yearsWithFirm} onChange={(e) => setYearsWithFirm(e.target.value)} placeholder="5" />
            </div>
            <div>
              <Label>Page limit (1–100)</Label>
              <Input
                type="number"
                min={1}
                max={100}
                value={pageLimit}
                onChange={(e) => setPageLimit(e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label>Job description</Label>
            <Textarea value={jobDescription} onChange={(e) => setJobDescription(e.target.value)} />
          </div>

          <div>
            <Label>Recruiter comments</Label>
            <Textarea value={recruiterComments} onChange={(e) => setRecruiterComments(e.target.value)} />
          </div>

          <Button type="submit" className="w-full sm:w-auto" disabled={busy}>
            {busy ? "Creating and starting…" : "Create & start pipeline"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
