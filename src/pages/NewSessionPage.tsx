import { useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";

import clsx from "clsx";

import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { createSession, formatApiError, startSession, uploadSource, uploadTor } from "../lib/api";
import { upsertRecentSession } from "../lib/recentSessions";
import { Button, Input, Label, Textarea } from "../components/ui";

function FieldGroup({ label, htmlFor, children }: { label: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="new-session-field-group">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

function TileIcon({ children, variant = "default" }: { children: ReactNode; variant?: "default" | "success" }) {
  return (
    <span
      className={clsx("new-session-tile-icon", variant === "success" && "new-session-tile-icon--success")}
      aria-hidden
    >
      {children}
    </span>
  );
}

function ChoiceTile({
  title,
  subtitle,
  icon,
  selected,
  onClick,
  className,
  role,
  "aria-checked": ariaChecked,
  truncateTitle = false,
}: {
  title: string;
  subtitle: string;
  icon: ReactNode;
  selected?: boolean;
  onClick?: () => void;
  className?: string;
  role?: string;
  "aria-checked"?: boolean;
  truncateTitle?: boolean;
}) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      type={onClick ? "button" : undefined}
      role={role}
      aria-checked={ariaChecked}
      onClick={onClick}
      className={clsx("new-session-tile", selected && "new-session-tile--selected", className)}
    >
      <TileIcon variant={selected ? "success" : "default"}>{icon}</TileIcon>
      <span className="new-session-tile-body">
        <span className={clsx("new-session-tile-title", truncateTitle && "new-session-tile-title--truncate")}>
          {title}
        </span>
        <span className="new-session-tile-subtitle">{subtitle}</span>
      </span>
    </Comp>
  );
}

function FormatIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-5 w-5">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6 4h8a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z"
      />
      <path fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" d="M7 8h6M7 11h4" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-5 w-5">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M10 4v9M7 7l3-3 3 3M5 14h10a1 1 0 0 1 1 1v1H4v-1a1 1 0 0 1 1-1Z"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-5 w-5">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M5 10.5 8.5 14 15 7"
      />
    </svg>
  );
}

function FormatOption({
  label,
  description,
  selected,
  onSelect,
}: {
  label: string;
  description: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <ChoiceTile
      title={label}
      subtitle={description}
      icon={<FormatIcon />}
      selected={selected}
      onClick={onSelect}
      role="radio"
      aria-checked={selected}
    />
  );
}

function FileDropZone({
  id,
  label,
  hint,
  accept,
  file,
  onFile,
  required,
}: {
  id: string;
  label: string;
  hint: string;
  accept: string;
  file: File | null;
  onFile: (f: File | null) => void;
  required?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <FieldGroup label={label} htmlFor={id}>
      <ChoiceTile
        title={file ? file.name : "Choose a file"}
        subtitle={file ? "Click to replace" : hint}
        icon={file ? <CheckIcon /> : <UploadIcon />}
        selected={!!file}
        truncateTitle={!!file}
        onClick={() => inputRef.current?.click()}
        className="w-full"
      />
      <input
        ref={inputRef}
        id={id}
        type="file"
        className="sr-only"
        required={required}
        accept={accept}
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />
    </FieldGroup>
  );
}

function FormSection({
  step,
  eyebrow,
  title,
  description,
  children,
}: {
  step: string;
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="session-panel session-card">
      <div className="session-card-header">
        <span className="session-card-eyebrow">
          {step} · {eyebrow}
        </span>
        <h2 className="session-card-title">{title}</h2>
        <p className="session-card-body !mt-2 !text-[0.8125rem]">{description}</p>
      </div>
      <div className="new-session-fields-stack mt-6">{children}</div>
    </section>
  );
}

const FILE_ACCEPT =
  ".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

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
      navigate(`/sessions/${session_id}`, { replace: true, state: { sourceFilename } });
    } catch (err: unknown) {
      toast(formatApiError(err), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="new-session-page session-workspace-root w-full min-w-0 pb-10">
      <header className="pb-1 pt-1">
        <Link className="session-link-back" to="/">
          ← Back
        </Link>
        <h1 className="mt-5 text-[1.75rem] font-medium leading-tight tracking-[-0.02em] text-[var(--chat-text,#ececec)] sm:text-[2rem]">
          New reformat
        </h1>
        <p className="mt-2 max-w-lg text-[0.9375rem] leading-relaxed text-[var(--chat-muted,#8e8e8e)]">
          Upload your CV and ToR, add context if you have it, then start the pipeline in one step.
        </p>
      </header>

      <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-6 sm:gap-7">
        <FormSection
          step="01"
          eyebrow="Setup"
          title="Format & files"
          description="Choose the donor template and upload the documents we will reformat."
        >
          <FieldGroup label="Donor format">
            <div className="new-session-tile-grid" role="radiogroup" aria-label="Donor format">
              <FormatOption
                label="GIZ"
                description="German development cooperation template"
                selected={targetFormat === "giz"}
                onSelect={() => setTargetFormat("giz")}
              />
              <FormatOption
                label="World Bank"
                description="WB consultant CV layout"
                selected={targetFormat === "world_bank"}
                onSelect={() => setTargetFormat("world_bank")}
              />
            </div>
          </FieldGroup>

          <FileDropZone
            id="cv-file"
            label="CV file"
            hint=".docx or .pdf — required"
            accept={FILE_ACCEPT}
            file={cvFile}
            onFile={setCvFile}
            required
          />

          <FileDropZone
            id="tor-file"
            label="Terms of Reference"
            hint=".docx or .pdf — required"
            accept={FILE_ACCEPT}
            file={torFile}
            onFile={setTorFile}
            required
          />
        </FormSection>

        <FormSection
          step="02"
          eyebrow="Context"
          title="Project details"
          description="Optional fields that help match the role and page constraints."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <FieldGroup label="Category" htmlFor="category">
              <Input
                id="category"
                className="new-session-field"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Senior Expert"
              />
            </FieldGroup>
            <FieldGroup label="Employer" htmlFor="employer">
              <Input
                id="employer"
                className="new-session-field"
                value={employer}
                onChange={(e) => setEmployer(e.target.value)}
                placeholder="Firm or organisation"
              />
            </FieldGroup>
            <FieldGroup label="Years with firm" htmlFor="years-with-firm">
              <Input
                id="years-with-firm"
                className="new-session-field"
                value={yearsWithFirm}
                onChange={(e) => setYearsWithFirm(e.target.value)}
                placeholder="5"
              />
            </FieldGroup>
            <FieldGroup label="Page limit" htmlFor="page-limit">
              <Input
                id="page-limit"
                className="new-session-field"
                type="number"
                min={1}
                max={100}
                value={pageLimit}
                onChange={(e) => setPageLimit(e.target.value)}
              />
            </FieldGroup>
          </div>
        </FormSection>

        <FormSection
          step="03"
          eyebrow="Notes"
          title="Additional guidance"
          description="Paste role expectations or recruiter notes to steer writing quality."
        >
          <FieldGroup label="Job description" htmlFor="job-description">
            <Textarea
              id="job-description"
              className="new-session-field min-h-[7.5rem]"
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              placeholder="Key responsibilities, scope, must-have expertise…"
            />
          </FieldGroup>
          <FieldGroup label="Recruiter comments" htmlFor="recruiter-comments">
            <Textarea
              id="recruiter-comments"
              className="new-session-field min-h-[6.5rem]"
              value={recruiterComments}
              onChange={(e) => setRecruiterComments(e.target.value)}
              placeholder="Constraints, emphasis, or submission notes…"
            />
          </FieldGroup>
        </FormSection>

        <div className="session-panel session-card flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-7">
          <p className="text-sm leading-relaxed text-[var(--chat-muted,#8e8e8e)]">
            Creates a session, uploads both files, and starts the pipeline immediately.
          </p>
          <Button type="submit" className="session-btn-primary shrink-0 px-6" disabled={busy}>
            {busy ? "Creating and starting…" : "Create & start pipeline"}
          </Button>
        </div>
      </form>
    </div>
  );
}
