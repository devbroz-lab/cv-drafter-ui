import { useCallback, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";

import clsx from "clsx";

import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { createSession, formatApiError, startSession, uploadSource, uploadTor } from "../lib/api";
import { fetchMeterBalance, formatCredits, parseCredits } from "../lib/metering";
import { upsertRecentSession } from "../lib/recentSessions";

const FILE_ACCEPT =
  ".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const FORMATS = [
  { id: "giz" as const, label: "GIZ", hint: "Development template" },
  { id: "world_bank" as const, label: "World Bank", hint: "WB consultant layout" },
];

function StepHeader({ step, title, description }: { step: string; title: string; description: string }) {
  return (
    <header className="ns-step__head">
      <div className="ns-step__head-main">
        <p className="ns-step__kicker">{step}</p>
        <h2 className="ns-step__title">{title}</h2>
      </div>
      <p className="ns-step__desc">{description}</p>
    </header>
  );
}

function SegmentedFormat({
  value,
  onChange,
}: {
  value: "giz" | "world_bank";
  onChange: (v: "giz" | "world_bank") => void;
}) {
  return (
    <div className="ns-field">
      <span className="ns-label" id="donor-format-label">
        Donor format
      </span>
      <div className="ns-segment" role="radiogroup" aria-labelledby="donor-format-label">
        {FORMATS.map((f) => (
          <button
            key={f.id}
            type="button"
            role="radio"
            aria-checked={value === f.id}
            className={clsx("ns-segment__opt", value === f.id && "ns-segment__opt--active")}
            onClick={() => onChange(f.id)}
          >
            <span className="ns-segment__label">{f.label}</span>
            <span className="ns-segment__hint">{f.hint}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function UploadRow({
  id,
  label,
  file,
  onFile,
  required,
}: {
  id: string;
  label: string;
  file: File | null;
  onFile: (f: File | null) => void;
  required?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const pick = useCallback(() => inputRef.current?.click(), []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const f = e.dataTransfer.files?.[0];
      if (f) onFile(f);
    },
    [onFile],
  );

  return (
    <div className="ns-field">
      <label className="ns-label" htmlFor={id}>
        {label}
      </label>
      <button
        type="button"
        className={clsx("ns-upload", file && "ns-upload--done", dragging && "ns-upload--drag")}
        onClick={pick}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <span className="ns-upload__icon" aria-hidden>
          {file ? (
            <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.5 8.5 6.5 11.5 12.5 5.5" />
            </svg>
          ) : (
            <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" d="M8 3v7M5.5 5.5 8 3l2.5 2.5" />
              <path strokeLinecap="round" d="M4 12h8" />
            </svg>
          )}
        </span>
        <span className="ns-upload__copy">
          <span className={clsx("ns-upload__primary", file && "ns-upload__primary--truncate")}>
            {file ? file.name : "Drop file or browse"}
          </span>
          <span className="ns-upload__secondary">{file ? "Click to replace" : "DOCX or PDF"}</span>
        </span>
        <span className="ns-upload__action">{file ? "Change" : "Browse"}</span>
      </button>
      <input
        ref={inputRef}
        id={id}
        type="file"
        className="sr-only"
        required={required}
        accept={FILE_ACCEPT}
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />
    </div>
  );
}

export function NewSessionPage() {
  const { accessToken } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
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

  const balanceQuery = useQuery({
    queryKey: ["metering", "balance"],
    queryFn: () => fetchMeterBalance(accessToken!),
    enabled: Boolean(accessToken),
    staleTime: 30_000,
  });

  const pipelineCost = parseCredits(balanceQuery.data?.rates.pipeline_run_credits);
  const availableCredits = parseCredits(balanceQuery.data?.available_credits);
  const canAffordStart =
    !balanceQuery.isSuccess || availableCredits >= pipelineCost;

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
    if (!canAffordStart) {
      toast(
        `Not enough credits. This run needs ${formatCredits(pipelineCost)} credits; you have ${formatCredits(availableCredits)} available.`,
        "error",
      );
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

      upsertRecentSession({
        id: session_id,
        label: sourceFilename,
        targetFormat,
        updatedAt: new Date().toISOString(),
      });
      void queryClient.invalidateQueries({ queryKey: ["sessions", "list"] });
      void queryClient.invalidateQueries({ queryKey: ["metering", "balance"] });

      // Open workspace immediately so a slow/hung POST /start does not trap the user on "Starting…"
      navigate(`/sessions/${session_id}`, { replace: true, state: { sourceFilename } });

      try {
        await startSession(accessToken, session_id);
        toast("Session started. Pipeline is running.");
      } catch (startErr: unknown) {
        toast(
          `Files uploaded, but start did not confirm: ${formatApiError(startErr)}. The workspace will retry.`,
          "error",
        );
      }
    } catch (err: unknown) {
      toast(formatApiError(err), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ns session-workspace-root w-full min-w-0 pb-12">
      <header className="ns-hero">
        <Link className="ns-hero__back" to="/">
          ← Back
        </Link>
        <h1 className="ns-hero__title">New reformat</h1>
        <p className="ns-hero__lead">
          Upload your documents, add optional context, and start the pipeline in one step.
        </p>
      </header>

      <div className="ns-surface">
        <form className="ns-form" onSubmit={onSubmit} noValidate>
          <section className="ns-step" aria-labelledby="step-1-title">
            <StepHeader
              step="Step 1"
              title="Documents"
              description="Select a donor template and upload your CV and terms of reference."
            />
            <div className="ns-step__body ns-step__body--documents">
              <SegmentedFormat value={targetFormat} onChange={setTargetFormat} />
              <div className="ns-upload-stack">
                <UploadRow id="cv-file" label="CV" file={cvFile} onFile={setCvFile} required />
                <UploadRow
                  id="tor-file"
                  label="Terms of reference"
                  file={torFile}
                  onFile={setTorFile}
                  required
                />
              </div>
            </div>
          </section>

          <hr className="ns-divider" />

          <section className="ns-step" aria-labelledby="step-2-title">
            <StepHeader
              step="Step 2"
              title="Project context"
              description="Optional details that improve role matching and page limits."
            />
            <div className="ns-step__body">
              <div className="ns-grid-2">
                <div className="ns-field">
                  <label className="ns-label ns-label--optional" htmlFor="category">
                    Category
                  </label>
                  <input
                    id="category"
                    className="ns-input"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="Senior Expert"
                    autoComplete="off"
                  />
                </div>
                <div className="ns-field">
                  <label className="ns-label ns-label--optional" htmlFor="employer">
                    Employer
                  </label>
                  <input
                    id="employer"
                    className="ns-input"
                    value={employer}
                    onChange={(e) => setEmployer(e.target.value)}
                    placeholder="Organisation"
                    autoComplete="organization"
                  />
                </div>
                <div className="ns-field">
                  <label className="ns-label ns-label--optional" htmlFor="years-with-firm">
                    Years with firm
                  </label>
                  <input
                    id="years-with-firm"
                    className="ns-input"
                    value={yearsWithFirm}
                    onChange={(e) => setYearsWithFirm(e.target.value)}
                    placeholder="5"
                    inputMode="numeric"
                  />
                </div>
                <div className="ns-field">
                  <label className="ns-label ns-label--optional" htmlFor="page-limit">
                    Page limit
                  </label>
                  <input
                    id="page-limit"
                    className="ns-input"
                    type="number"
                    min={1}
                    max={100}
                    value={pageLimit}
                    onChange={(e) => setPageLimit(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </section>

          <hr className="ns-divider" />

          <section className="ns-step">
            <StepHeader
              step="Step 3"
              title="Guidance"
              description="Paste role expectations or recruiter notes for the writing pass."
            />
            <div className="ns-step__body ns-step__body--notes">
              <div className="ns-field">
                <label className="ns-label ns-label--optional" htmlFor="job-description">
                  Job description
                </label>
                <textarea
                  id="job-description"
                  className="ns-textarea"
                  value={jobDescription}
                  onChange={(e) => setJobDescription(e.target.value)}
                  placeholder="Responsibilities, scope, must-have expertise…"
                />
              </div>
              <div className="ns-field">
                <label className="ns-label ns-label--optional" htmlFor="recruiter-comments">
                  Recruiter comments
                </label>
                <textarea
                  id="recruiter-comments"
                  className="ns-textarea"
                  value={recruiterComments}
                  onChange={(e) => setRecruiterComments(e.target.value)}
                  placeholder="Constraints, emphasis, submission notes…"
                />
              </div>
            </div>
          </section>

          <footer className="ns-footer">
            <p className="ns-footer__hint">
              {balanceQuery.isSuccess ? (
                <>
                  Uses <strong>{formatCredits(pipelineCost)} credits</strong> (reserved until the run
                  completes or fails). You have{" "}
                  <strong>{formatCredits(availableCredits)}</strong> available.
                </>
              ) : (
                "Creates a session, uploads files, and runs the pipeline."
              )}
            </p>
            <button
              type="submit"
              className="ns-footer__btn"
              disabled={busy || (balanceQuery.isSuccess && !canAffordStart)}
            >
              {busy ? "Starting…" : "Create & start"}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
