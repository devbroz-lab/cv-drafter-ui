/**
 * locatorToDotPath — converts a structural XML locator from the DocxViewer
 * into a CVData dot-path for POST /sessions/{id}/field-edit.
 *
 * Ground truth: templates/giz_dynamic_template.py and templates/wb_dynamic_template.py.
 *
 * Confidence levels:
 *   "mapped"   — known table cell; dot-path is certain
 *   "fallback" — paragraph or unknown table position; dot-path is a best-guess
 *
 * Composite cells:
 *   Some cells render multiple CVData fields in a single cell (e.g. WB Table 2
 *   cell 1 contains both employer and position). These are returned with a
 *   `composite` array of options. The caller (FieldSelectorTooltip) presents
 *   the options to the user before building the edit instruction.
 *
 * Special case:
 *   WB Table 3 cell 0 contains `tasks_assigned` which maps to
 *   `generated_fields[j].content` (field_key === "detailed_tasks"). This
 *   requires runtime resolution against the output cv_data — the result type
 *   carries `needsTasksAssignedResolution` for the caller to handle.
 */

import type {
  CompositeCellOption,
  CVDataLite,
  GeneratedField,
  TargetFormat,
} from "../types";

// ---------------------------------------------------------------------------
// Locator input type
// ---------------------------------------------------------------------------

export type Locator =
  | { location: "paragraph"; paragraph_index: number; text_content: string }
  | {
      location: "table";
      table_index: number;
      row_index: number;
      cell_index: number;
      text_content: string;
    };

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

export type LocatorMappingResult =
  | {
      kind: "simple";
      dotPath: string;
      confidence: "mapped" | "fallback";
      label: string;
    }
  | {
      kind: "composite";
      /** Empty — caller must prompt user to pick from `options` */
      dotPath: "";
      confidence: "mapped";
      label: string;
      options: CompositeCellOption[];
    }
  | {
      kind: "tasks_assigned";
      /** Resolved at runtime via resolveTasksAssignedPath() */
      dotPath: "";
      confidence: "mapped";
      label: string;
      /** Zero-based project (row) index inside the Relevant Projects table */
      projectIndex: number;
    };

// ---------------------------------------------------------------------------
// GIZ table structure
// Ground truth: giz_dynamic_template.py preprocess_document_xml()
//   expand_table(xml, 1, n_edu,       edu_subs)       → table_index 1
//   expand_table(xml, 2, n_lang,      lang_subs)      → table_index 2
//   expand_table(xml, 4, n_countries, country_subs)   → table_index 4
//   expand_table(xml, 5, n_projects,  proj_subs)      → table_index 5
//
// Row indices are 0-based in document order; header row is row 0, so
// data rows start at row 1 → array_index = row_index - 1.
// ---------------------------------------------------------------------------

function gizTableToDotPath(
  tableIndex: number,
  rowIndex: number,
  cellIndex: number,
): LocatorMappingResult | null {
  switch (tableIndex) {
    case 0: {
      // Personal Info / Header — static table, no row expansion.
      // cell 0 is the label, cell 1 is the editable value.
      if (cellIndex !== 1) return null;
      switch (rowIndex) {
        case 0: return { kind: "simple", dotPath: "proposed_position",           confidence: "mapped", label: "Proposed role"         };
        case 1: return { kind: "simple", dotPath: "category",                    confidence: "mapped", label: "Category"              };
        case 2: return { kind: "simple", dotPath: "employer",                    confidence: "mapped", label: "Name of firm"          };
        case 3: return { kind: "simple", dotPath: "personal_info.title",         confidence: "mapped", label: "Title"                 };
        case 4: return { kind: "simple", dotPath: "personal_info.first_names",   confidence: "mapped", label: "First names"           };
        case 5: return { kind: "simple", dotPath: "personal_info.family_name",   confidence: "mapped", label: "Family name"           };
        case 6: return { kind: "simple", dotPath: "personal_info.date_of_birth", confidence: "mapped", label: "Date of birth"         };
        case 7: return {
          kind: "composite", dotPath: "", confidence: "mapped",
          label: "Nationality",
          options: [
            { label: "Primary nationality", dotPath: "personal_info.nationality"        },
            { label: "Second nationality",  dotPath: "personal_info.nationality_second" },
          ],
        };
        case 8: return { kind: "simple", dotPath: "personal_info.place_of_residence", confidence: "mapped", label: "Place of residence" };
      }
      return null;
    }
    case 3: {
      // Skills / Membership — static table, no row expansion.
      // Placed before the rowIndex guard because row 0 (membership_professional_bodies) must be reachable.
      // cell 0 is the label, cell 1 is the editable value.
      if (cellIndex !== 1) return null;
      switch (rowIndex) {
        case 0: return { kind: "simple", dotPath: "membership_professional_bodies", confidence: "mapped", label: "Membership in professional bodies" };
        // other_skills is free text (a single string), handled exactly like
        // membership_professional_bodies above — a simple scalar cell.
        case 1: return { kind: "simple", dotPath: "other_skills", confidence: "mapped", label: "Other skills" };
        case 2: return { kind: "simple", dotPath: "present_position", confidence: "mapped", label: "Present position" };
        case 3: return { kind: "simple", dotPath: "years_with_firm",  confidence: "mapped", label: "Years within the firm" };
      }
      return null;
    }
  }

  // Tables 1, 2, 4, 5 use dynamic row expansion — data rows start at rowIndex 1.
  const i = rowIndex - 1;
  if (i < 0) return null; // header row — not editable

  switch (tableIndex) {
    case 1: {
      // Education
      // cell 0: institution (paragraph 0) + date_from – date_to (paragraph 1) — composite
      // cell 1: degree
      if (cellIndex === 0)
        return {
          kind: "composite",
          dotPath: "",
          confidence: "mapped",
          label: `Education ${i + 1} — institution / dates`,
          options: [
            { label: "Institution", dotPath: `education[${i}].institution` },
            { label: "Date From",   dotPath: `education[${i}].date_from`   },
            { label: "Date To",     dotPath: `education[${i}].date_to`     },
          ],
        };
      if (cellIndex === 1)
        return {
          kind: "simple",
          dotPath: `education[${i}].degree`,
          confidence: "mapped",
          label: `Education ${i + 1} — degree`,
        };
      break;
    }
    case 2: {
      // Languages — cells 0–3: language, reading_cefr, speaking_cefr, writing_cefr
      const langFields: Array<{ path: string; label: string }> = [
        { path: "language",      label: "language name"  },
        { path: "reading_cefr",  label: "reading CEFR"   },
        { path: "speaking_cefr", label: "speaking CEFR"  },
        { path: "writing_cefr",  label: "writing CEFR"   },
      ];
      const lf = langFields[cellIndex];
      if (lf)
        return {
          kind: "simple",
          dotPath: `languages[${i}].${lf.path}`,
          confidence: "mapped",
          label: `Language ${i + 1} — ${lf.label}`,
        };
      break;
    }
    case 4: {
      // Countries of Experience
      // cell 0: country
      // cell 1: date_from – date_to combined string — composite
      if (cellIndex === 0)
        return {
          kind: "simple",
          dotPath: `countries_of_experience[${i}].country`,
          confidence: "mapped",
          label: `Country ${i + 1} — name`,
        };
      if (cellIndex === 1)
        return {
          kind: "composite",
          dotPath: "",
          confidence: "mapped",
          label: `Country ${i + 1} — date range`,
          options: [
            { label: "Date From", dotPath: `countries_of_experience[${i}].date_from` },
            { label: "Date To",   dotPath: `countries_of_experience[${i}].date_to`   },
          ],
        };
      break;
    }
    case 5: {
      // Relevant Projects — 6 cells (0-indexed):
      //   0: loop index (display only — not editable)
      //   1: date_from – date_to combined — composite
      //   2: location
      //   3: company
      //   4: positions_held
      //   5: project_name + main_project_features — composite
      if (cellIndex === 0) return null; // display-only loop index
      if (cellIndex === 1)
        return {
          kind: "composite",
          dotPath: "",
          confidence: "mapped",
          label: `Project ${i + 1} — date range`,
          options: [
            { label: "Date From", dotPath: `relevant_projects[${i}].date_from` },
            { label: "Date To",   dotPath: `relevant_projects[${i}].date_to`   },
          ],
        };
      if (cellIndex === 2)
        return {
          kind: "simple",
          dotPath: `relevant_projects[${i}].location`,
          confidence: "mapped",
          label: `Project ${i + 1} — location`,
        };
      if (cellIndex === 3)
        return {
          kind: "simple",
          dotPath: `relevant_projects[${i}].company`,
          confidence: "mapped",
          label: `Project ${i + 1} — company`,
        };
      if (cellIndex === 4)
        return {
          kind: "simple",
          dotPath: `relevant_projects[${i}].positions_held`,
          confidence: "mapped",
          label: `Project ${i + 1} — position held`,
        };
      if (cellIndex === 5)
        return {
          kind: "composite",
          dotPath: "",
          confidence: "mapped",
          label: `Project ${i + 1} — name / description`,
          options: [
            { label: "Project name",          dotPath: `relevant_projects[${i}].project_name`          },
            { label: "Project description",   dotPath: `relevant_projects[${i}].main_project_features` },
          ],
        };
      break;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// WB table structure
// Ground truth: wb_dynamic_template.py preprocess_document_xml()
//   expand_table(xml, 0, n_edu,  edu_subs)    → table_index 0  (3 cells)
//   expand_table(xml, 1, n_lang, lang_subs)   → table_index 1  (4 cells)
//   expand_table(xml, 2, n_emp,  emp_subs)    → table_index 2  (3 cells — NOT 4)
//   expand_table(xml, 3, n_proj, proj_subs)   → table_index 3  (2 cells — NOT 6)
// ---------------------------------------------------------------------------

function wbTableToDotPath(
  tableIndex: number,
  rowIndex: number,
  cellIndex: number,
): LocatorMappingResult | null {
  const i = rowIndex - 1;
  if (i < 0) return null; // header row

  switch (tableIndex) {
    case 0: {
      // Education — 3 cells
      if (cellIndex === 0)
        return {
          kind: "simple",
          dotPath: `education[${i}].institution`,
          confidence: "mapped",
          label: `Education ${i + 1} — institution`,
        };
      if (cellIndex === 1)
        return {
          kind: "simple",
          dotPath: `education[${i}].degree`,
          confidence: "mapped",
          label: `Education ${i + 1} — degree`,
        };
      if (cellIndex === 2)
        return {
          kind: "simple",
          dotPath: `education[${i}].date_obtained`,
          confidence: "mapped",
          label: `Education ${i + 1} — date obtained`,
        };
      break;
    }
    case 1: {
      // Languages — 4 cells (raw proficiency, not CEFR)
      const langFields: Array<{ path: string; label: string }> = [
        { path: "language",     label: "language name" },
        { path: "reading_raw",  label: "reading"       },
        { path: "speaking_raw", label: "speaking"      },
        { path: "writing_raw",  label: "writing"       },
      ];
      const lf = langFields[cellIndex];
      if (lf)
        return {
          kind: "simple",
          dotPath: `languages[${i}].${lf.path}`,
          confidence: "mapped",
          label: `Language ${i + 1} — ${lf.label}`,
        };
      break;
    }
    case 2: {
      // Employment Record — 3 cells (was incorrectly mapped as 4)
      // cell 0: from_date + to_date composite (period is a computed string, not a stored field)
      // cell 1: employer + positions_held composite (two paragraphs in one cell)
      // cell 2: country
      if (cellIndex === 0)
        return {
          kind: "composite",
          dotPath: "",
          confidence: "mapped",
          label: `Employment ${i + 1} — period`,
          options: [
            { label: "Date From", dotPath: `employment_record[${i}].from_date` },
            { label: "Date To",   dotPath: `employment_record[${i}].to_date`   },
          ],
        };
      if (cellIndex === 1)
        return {
          kind: "composite",
          dotPath: "",
          confidence: "mapped",
          label: `Employment ${i + 1} — employer / position`,
          options: [
            { label: "Employer", dotPath: `employment_record[${i}].employer`       },
            { label: "Position", dotPath: `employment_record[${i}].positions_held` },
          ],
        };
      if (cellIndex === 2)
        return {
          kind: "simple",
          dotPath: `employment_record[${i}].country`,
          confidence: "mapped",
          label: `Employment ${i + 1} — country`,
        };
      break;
    }
    case 3: {
      // Relevant Projects — 2 cells (was incorrectly mapped as 6)
      // cell 0: tasks_assigned — special case, mapped via generated_fields
      // cell 1: 7-field composite
      if (cellIndex === 0)
        return {
          kind: "tasks_assigned",
          dotPath: "",
          confidence: "mapped",
          label: `Project ${i + 1} — assigned tasks`,
          projectIndex: i,
        };
      if (cellIndex === 1)
        return {
          kind: "composite",
          dotPath: "",
          confidence: "mapped",
          label: `Project ${i + 1} — project details`,
          options: [
            { label: "Project Name",          dotPath: `relevant_projects[${i}].project_name`          },
            { label: "Year",                  dotPath: `relevant_projects[${i}].year`                  },
            { label: "Location",              dotPath: `relevant_projects[${i}].location`              },
            { label: "Client",                dotPath: `relevant_projects[${i}].client`                },
            { label: "Main Project Features", dotPath: `relevant_projects[${i}].main_project_features` },
            { label: "Positions Held",        dotPath: `relevant_projects[${i}].positions_held`        },
            { label: "Activities Performed",  dotPath: `relevant_projects[${i}].activities_performed`  },
          ],
        };
      break;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// WB header / personal-info paragraph mapping
// ---------------------------------------------------------------------------
//
// Unlike GIZ (which renders personal info + skills as tables 0 & 3), the WB
// template renders the header block as labelled PARAGRAPHS (Name of Staff,
// Proposed Position, Employer, Date of Birth, Nationality, Professional
// Membership, IT Skills, Countries of Work Experience). Map each by its label
// prefix to the CVData scalar path so these fields are editable, matching what
// GIZ already allows.

const WB_HEADER_FIELD_PATTERNS: Array<{ test: RegExp; dotPath: string; label: string }> = [
  { test: /^name of staff\b/i,        dotPath: "personal_info.full_name",          label: "Name of staff"        },
  { test: /^proposed position\b/i,    dotPath: "proposed_position",                label: "Proposed position"    },
  { test: /^employer\b/i,             dotPath: "employer",                         label: "Employer"             },
  { test: /^date of birth\b/i,        dotPath: "personal_info.date_of_birth",      label: "Date of birth"        },
  { test: /^nationality\b/i,          dotPath: "personal_info.nationality",        label: "Nationality"          },
  { test: /(membership in professional|professional certification or membership)/i,
                                      dotPath: "membership_professional_bodies",   label: "Membership in professional bodies" },
  { test: /^it skills\b/i,            dotPath: "other_skills",                     label: "Other skills"         },
];

/**
 * Map a WB header paragraph (e.g. "Date of Birth:  …") to its CVData dot-path.
 *
 * Scalar header fields → a simple cell. The "Countries of Work Experience"
 * line renders countries_display (a join of countries_of_experience[].country)
 * and is mapped to a per-country picker: one option per row, editing that
 * row's `.country` scalar (a row may itself be a multi-country string grouped
 * by date range). Returns null when the paragraph is not a WB header field.
 */
function wbParagraphToDotPath(
  text: string,
  cvData?: CVDataLite,
): LocatorMappingResult | null {
  const t = text.trim();

  // Countries of Work Experience — per-country picker (composite).
  if (/^countries of work experience\b/i.test(t)) {
    const rows = Array.isArray(cvData?.countries_of_experience)
      ? (cvData.countries_of_experience as Array<{ country?: string; date_from?: string; date_to?: string }>)
      : [];
    const options: CompositeCellOption[] = [];
    rows.forEach((row, i) => {
      const country = (row?.country ?? "").trim();
      if (!country) return; // keep original index; skip empty rows
      const from = (row?.date_from ?? "").trim();
      const to = (row?.date_to ?? "").trim();
      const range = from && to ? ` (${from} – ${to})` : from || to ? ` (${from || to})` : "";
      options.push({
        label: `${truncate(country, 48)}${range}`,
        dotPath: `countries_of_experience[${i}].country`,
      });
    });
    if (options.length === 0) return null;
    return {
      kind: "composite",
      dotPath: "",
      confidence: "mapped",
      label: "Countries of work experience",
      options,
    };
  }

  // Scalar header fields.
  for (const { test, dotPath, label } of WB_HEADER_FIELD_PATTERNS) {
    if (test.test(t)) {
      return { kind: "simple", dotPath, confidence: "mapped", label };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Key qualifications — paragraph clicks vs array indices
// ---------------------------------------------------------------------------
//
// DocxViewer assigns paragraph_index as the global <w:p> ordinal in
// document.xml. That must NOT be used as key_qualifications[N]: the list only
// has one entry per bullet while paragraph indices include headings, tables,
// and all sections. Resolve by matching clicked text to cv_data bullets and,
// for GIZ, by scanning paragraphs after the "Key qualifications" heading.

/** Minimal block shape for KQ layout fallback ( mirrors DocxViewer ParsedBlock ). */
export type KqDocBlock =
  | { kind: "paragraph"; paragraphIndex: number; text: string }
  | { kind: "table"; tableIndex: number };

export type LocatorToDotPathOptions = {
  /** Texts aligned with generated_fields.json → generated.key_qualifications[i]. */
  keyQualifications?: string[];
  /** Optional: GIZ output.docx paragraph order after the KQ section heading. */
  docBlocks?: KqDocBlock[];
  /** Scalar body field — often split across multiple Word paragraphs. */
  otherRelevantInfo?: string;
  /** Full CV data — used for KQ source resolution and the WB countries picker. */
  cvData?: CVDataLite;
};

function normalizeWhitespace(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

function truncate(s: string, maxLen: number): string {
  return s.length > maxLen ? s.slice(0, maxLen) + "…" : s;
}

function stripBulletPrefix(s: string): string {
  return s.replace(/^[\s•·▪▫\u2022\u2023\-–—*]+\s*/u, "").trim();
}

/** Builds the same bullet list the renderer / field editor use for paths like key_qualifications[i].
 *  Priority: generated_fields entries (field_key === "key_qualifications") first,
 *  falling back to top-level key_qualifications. Mirrors _build_context in templates/giz.py. */
export function effectiveKeyQualifications(cv: CVDataLite | undefined): string[] {
  if (!cv) return [];
  const gf = cv.generated_fields;
  if (Array.isArray(gf)) {
    const fromGf = gf
      .filter(
        (f): f is GeneratedField =>
          f.field_key === "key_qualifications" && typeof f.content === "string" && f.content.trim() !== "",
      )
      .map((f) => f.content.trim());
    if (fromGf.length > 0) return fromGf;
  }
  const top = cv.key_qualifications;
  if (Array.isArray(top) && top.length > 0) {
    const coerced = top.map((x) => String(x).trim()).filter(Boolean);
    if (coerced.length > 0) return coerced;
  }
  return [];
}

/**
 * Resolve the dot-path for a key_qualifications bullet at bulletIndex.
 *
 * When generated_fields is the active source (non-empty KQ entries exist there),
 * returns `generated_fields[j].content` for the j-th non-empty KQ entry.
 * Returns null when generated_fields isn't the active source — caller falls back
 * to `key_qualifications[bulletIndex]`.
 *
 * Mirrors resolveTasksAssignedPath in pattern.
 */
export function resolveKeyQualificationsPath(
  generatedFields: GeneratedField[] | undefined,
  bulletIndex: number,
): string | null {
  if (!generatedFields) return null;
  const kqEntries = generatedFields.filter(
    (f): f is GeneratedField =>
      f.field_key === "key_qualifications" && typeof f.content === "string" && f.content.trim() !== "",
  );
  if (kqEntries.length === 0) return null;
  if (bulletIndex >= kqEntries.length) return null;
  const j = generatedFields.indexOf(kqEntries[bulletIndex]);
  if (j === -1) return null;
  return `generated_fields[${j}].content`;
}

const KQ_TEXT_MATCH_MIN_SCORE = 40;

/**
 * Picks the best key_qualifications index for a clicked paragraph by comparing
 * its text to each bullet (exact, substring, or word-overlap).
 */
export function matchKeyQualificationIndex(
  paragraphText: string,
  bullets: string[],
): number | null {
  const p0 = stripBulletPrefix(paragraphText);
  const p = normalizeWhitespace(p0).toLowerCase();
  if (!p || bullets.length === 0) return null;

  let bestIdx: number | null = null;
  let bestScore = 0;

  for (let i = 0; i < bullets.length; i++) {
    const b0 = stripBulletPrefix(bullets[i]);
    const b = normalizeWhitespace(b0).toLowerCase();
    if (!b) continue;

    let score = 0;
    if (p === b) {
      score = 100;
    } else if (p.includes(b) || b.includes(p)) {
      score = 85;
    } else {
      const pw = new Set(p.split(/\s+/).filter((w) => w.length > 1));
      const bw = new Set(b.split(/\s+/).filter((w) => w.length > 1));
      let inter = 0;
      for (const w of pw) {
        if (bw.has(w)) inter += 1;
      }
      const union = pw.size + bw.size - inter;
      score = union > 0 ? Math.round((100 * inter) / union) : 0;
    }
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }

  if (bestIdx === null || bestScore < KQ_TEXT_MATCH_MIN_SCORE) return null;
  return bestIdx;
}

/**
 * GIZ: after the standalone heading paragraph matching /key qualifications/i,
 * consecutive body paragraphs (until Publications / References) map to
 * key_qualifications[0], [1], … in order.
 */
export function keyQualificationBulletIndexFromDocOrder(
  blocks: KqDocBlock[],
  clickedParagraphIndex: number,
  nBullets: number,
): number | null {
  if (nBullets <= 0) return null;
  let phase: "before" | "in_kq" = "before";
  let ordinal = 0;
  for (const block of blocks) {
    if (block.kind === "table") {
      // Tables after the KQ heading (e.g. layout sections) must not abort —
      // body-level paragraphs after them still map to bullets by ordinal.
      continue;
    }
    const t = block.text.trim();
    if (!t) continue;
    if (phase === "before") {
      // Heading variants (template may prefix with "11." etc.).
      if (
        /\bkey\s+qualifications\b/i.test(t) ||
        /^\s*\d+\.?\s*key\s+qualifications\b/i.test(t)
      ) {
        phase = "in_kq";
      }
      continue;
    }
    if (/^(publications?|references)\b/i.test(t)) break;
    if (block.paragraphIndex === clickedParagraphIndex) {
      return ordinal < nBullets ? ordinal : null;
    }
    ordinal += 1;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Other relevant information — single scalar, may span multiple <w:p>
// ---------------------------------------------------------------------------

const ORI_TEXT_MATCH_MIN_SCORE = 35;

/** Trimmed `other_relevant_info` from session output (generated payload). */
export function effectiveOtherRelevantInfo(cv: CVDataLite | undefined): string {
  if (!cv) return "";
  const v = cv.other_relevant_info;
  if (typeof v !== "string") return "";
  return v.trim();
}

/**
 * True if clicked text belongs to the stored ORI body (substring / word overlap).
 */
export function matchParagraphToOtherRelevantInfo(
  paragraphText: string,
  otherRelevantInfo: string,
): boolean {
  const o = normalizeWhitespace(otherRelevantInfo).toLowerCase();
  const p0 = stripBulletPrefix(paragraphText);
  const p = normalizeWhitespace(p0).toLowerCase();
  if (!p || !o) return false;
  if (p === o) return true;
  if (o.includes(p)) return true;
  if (p.includes(o) && o.length >= 12) return true;
  const pw = new Set(p.split(/\s+/).filter((w) => w.length > 1));
  const ow = new Set(o.split(/\s+/).filter((w) => w.length > 1));
  if (pw.size === 0) return false;
  let inter = 0;
  for (const w of pw) {
    if (ow.has(w)) inter += 1;
  }
  const union = pw.size + ow.size - inter;
  const score = union > 0 ? Math.round((100 * inter) / union) : 0;
  return score >= ORI_TEXT_MATCH_MIN_SCORE;
}

/**
 * GIZ: paragraphs after the "Other relevant information" heading map to that field.
 */
export function paragraphInOtherRelevantSection(
  blocks: KqDocBlock[],
  clickedParagraphIndex: number,
): boolean {
  let phase: "before" | "in_ori" = "before";
  for (const block of blocks) {
    if (block.kind === "table") continue;
    const t = block.text.trim();
    if (!t) continue;
    if (phase === "before") {
      if (/\bother\s+relevant\s+information\b/i.test(t)) phase = "in_ori";
      continue;
    }
    if (block.paragraphIndex === clickedParagraphIndex) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// tasks_assigned runtime resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the dot-path for WB Table 3 cell 0 (tasks_assigned / detailed_tasks).
 *
 * The content displayed in that cell is not a scalar on relevant_projects[i].
 * It comes from generated_fields entries where field_key === "detailed_tasks",
 * aligned by index to the relevant project row.
 *
 * Returns the dot-path string `generated_fields[j].content` or null if the
 * entry cannot be found (caller should render cell as non-clickable).
 */
export function resolveTasksAssignedPath(
  generatedFields: GeneratedField[] | undefined,
  projectIndex: number,
): string | null {
  if (!generatedFields) return null;
  const detailedTaskEntries = generatedFields.filter(
    (f) => f.field_key === "detailed_tasks",
  );
  if (projectIndex >= detailedTaskEntries.length) return null;
  const j = generatedFields.indexOf(detailedTaskEntries[projectIndex]);
  if (j === -1) return null;
  return `generated_fields[${j}].content`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function locatorToDotPath(
  locator: Locator,
  targetFormat: TargetFormat,
  options?: LocatorToDotPathOptions,
): LocatorMappingResult {
  if (locator.location === "table") {
    const { table_index, row_index, cell_index } = locator;
    const mapped =
      targetFormat === "giz"
        ? gizTableToDotPath(table_index, row_index, cell_index)
        : wbTableToDotPath(table_index, row_index, cell_index);

    if (mapped) return mapped;

    // Unknown table/cell — fallback so the user can type the correct path
    return {
      kind: "simple",
      dotPath: `table_${table_index}_row_${row_index}_cell_${cell_index}`,
      confidence: "fallback",
      label: `Table ${table_index}, row ${row_index}, cell ${cell_index}`,
    };
  }

  // Paragraph — map to key_qualifications[i] using CV bullet text and/or GIZ
  // section order. Never use raw paragraph_index as the array subscript.
  const text = locator.text_content.trim();

  // WB renders its header/personal-info block as labelled paragraphs (GIZ uses
  // tables 0 & 3). Resolve those first so they don't fall to the paragraph_N
  // fallback. WB has no key_qualifications / other_relevant_info sections.
  if (targetFormat === "world_bank") {
    const wbHeader = wbParagraphToDotPath(text, options?.cvData);
    if (wbHeader) return wbHeader;
  }

  const kqList = options?.keyQualifications ?? [];
  let kqIdx: number | null =
    kqList.length > 0 ? matchKeyQualificationIndex(text, kqList) : null;
  if (kqIdx === null && targetFormat === "giz" && kqList.length > 0 && options?.docBlocks?.length) {
    kqIdx = keyQualificationBulletIndexFromDocOrder(
      options.docBlocks,
      locator.paragraph_index,
      kqList.length,
    );
  }
  if (kqIdx !== null) {
    const kqPath =
      resolveKeyQualificationsPath(options?.cvData?.generated_fields as GeneratedField[] | undefined, kqIdx) ??
      `key_qualifications[${kqIdx}]`;
    return {
      kind: "simple",
      dotPath: kqPath,
      confidence: "mapped",
      label: `Key qualification ${kqIdx + 1}`,
    };
  }

  const ori = options?.otherRelevantInfo?.trim();
  if (ori) {
    if (matchParagraphToOtherRelevantInfo(text, ori)) {
      return {
        kind: "simple",
        dotPath: "other_relevant_info",
        confidence: "mapped",
        label: "Other relevant information",
      };
    }
    if (
      options?.docBlocks?.length &&
      paragraphInOtherRelevantSection(options.docBlocks, locator.paragraph_index)
    ) {
      return {
        kind: "simple",
        dotPath: "other_relevant_info",
        confidence: "mapped",
        label: "Other relevant information",
      };
    }
  }

  return {
    kind: "simple",
    dotPath: `paragraph_${locator.paragraph_index}`,
    confidence: "fallback",
    label: `Paragraph ${locator.paragraph_index}`,
  };
}
