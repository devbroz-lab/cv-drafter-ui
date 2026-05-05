/**
 * locatorToDotPath — converts a structural XML locator from the DocxViewer
 * into a CVData dot-path for POST /sessions/{id}/field-edit.
 *
 * The mapping is derived directly from the backend dynamic template preprocessors:
 *   templates/giz_dynamic_template.py  (expand_table calls + cell substitution fns)
 *   templates/wb_dynamic_template.py   (same pattern, different table layout)
 *
 * Confidence levels:
 *   "mapped"   — known table cell; dot-path is certain and can be passed directly
 *   "fallback" — paragraph or unknown table position; dot-path is a best-guess
 *                that the user should review before submitting
 */

import type { TargetFormat } from "../types";

export type Locator =
  | { location: "paragraph"; paragraph_index: number; text_content: string }
  | {
      location: "table";
      table_index: number;
      row_index: number;
      cell_index: number;
      text_content: string;
    };

export type LocatorMappingResult = {
  dotPath: string;
  confidence: "mapped" | "fallback";
  /** Human-readable label shown in the field editor reference list */
  label: string;
};

// ---------------------------------------------------------------------------
// GIZ table structure
// Derived from giz_dynamic_template.py preprocess_document_xml():
//   expand_table(xml, 1, n_edu,       edu_subs)       → table_index 1
//   expand_table(xml, 2, n_lang,      lang_subs)      → table_index 2
//   expand_table(xml, 4, n_countries, country_subs)   → table_index 4
//   expand_table(xml, 5, n_projects,  proj_subs)      → table_index 5
// ---------------------------------------------------------------------------

function gizTableToDotPath(
  tableIndex: number,
  rowIndex: number,
  cellIndex: number,
): LocatorMappingResult | null {
  switch (tableIndex) {
    case 1: {
      // Education — cell 0: institution+dates, cell 1: degree
      if (cellIndex === 0)
        return { dotPath: `education.${rowIndex}.institution`, confidence: "mapped", label: `Education ${rowIndex + 1} — institution` };
      if (cellIndex === 1)
        return { dotPath: `education.${rowIndex}.degree`, confidence: "mapped", label: `Education ${rowIndex + 1} — degree` };
      break;
    }
    case 2: {
      // Languages — cells 0–3: language, reading_cefr, speaking_cefr, writing_cefr
      const langFields = [
        { path: "language", label: "language name" },
        { path: "reading_cefr", label: "reading CEFR" },
        { path: "speaking_cefr", label: "speaking CEFR" },
        { path: "writing_cefr", label: "writing CEFR" },
      ];
      const lf = langFields[cellIndex];
      if (lf)
        return {
          dotPath: `languages.${rowIndex}.${lf.path}`,
          confidence: "mapped",
          label: `Language ${rowIndex + 1} — ${lf.label}`,
        };
      break;
    }
    case 4: {
      // Countries of Experience — cell 0: country, cell 1: date_from
      if (cellIndex === 0)
        return {
          dotPath: `countries_of_experience.${rowIndex}.country`,
          confidence: "mapped",
          label: `Country ${rowIndex + 1} — name`,
        };
      if (cellIndex === 1)
        return {
          dotPath: `countries_of_experience.${rowIndex}.date_from`,
          confidence: "mapped",
          label: `Country ${rowIndex + 1} — date from`,
        };
      break;
    }
    case 5: {
      // Relevant Projects:
      //   cell 0: loop index (display only — not a CVData field)
      //   cell 1: date_from + date_to
      //   cell 2: location
      //   cell 3: company
      //   cell 4: positions_held
      //   cell 5: project_name + main_project_features
      const projMap: Record<number, { path: string; label: string }> = {
        1: { path: "date_from", label: "date from" },
        2: { path: "location", label: "location" },
        3: { path: "company", label: "company" },
        4: { path: "positions_held", label: "position held" },
        5: { path: "project_name", label: "project name / features" },
      };
      const pm = projMap[cellIndex];
      if (pm)
        return {
          dotPath: `relevant_projects.${rowIndex}.${pm.path}`,
          confidence: "mapped",
          label: `Project ${rowIndex + 1} — ${pm.label}`,
        };
      break;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// WB table structure
// Derived from wb_dynamic_template.py preprocess_document_xml():
//   expand_table(xml, 0, n_edu,  edu_subs)    → table_index 0
//   expand_table(xml, 1, n_lang, lang_subs)   → table_index 1
//   expand_table(xml, 2, n_emp,  emp_subs)    → table_index 2 (employment)
//   expand_table(xml, 3, n_proj, proj_subs)   → table_index 3
// ---------------------------------------------------------------------------

function wbTableToDotPath(
  tableIndex: number,
  rowIndex: number,
  cellIndex: number,
): LocatorMappingResult | null {
  switch (tableIndex) {
    case 0: {
      // Education
      if (cellIndex === 0)
        return { dotPath: `education.${rowIndex}.institution`, confidence: "mapped", label: `Education ${rowIndex + 1} — institution` };
      if (cellIndex === 1)
        return { dotPath: `education.${rowIndex}.degree`, confidence: "mapped", label: `Education ${rowIndex + 1} — degree` };
      if (cellIndex === 2)
        return { dotPath: `education.${rowIndex}.date_obtained`, confidence: "mapped", label: `Education ${rowIndex + 1} — date obtained` };
      break;
    }
    case 1: {
      // Languages (WB uses raw proficiency, not CEFR)
      const langFields = [
        { path: "language", label: "language name" },
        { path: "reading_raw", label: "reading" },
        { path: "speaking_raw", label: "speaking" },
        { path: "writing_raw", label: "writing" },
      ];
      const lf = langFields[cellIndex];
      if (lf)
        return {
          dotPath: `languages.${rowIndex}.${lf.path}`,
          confidence: "mapped",
          label: `Language ${rowIndex + 1} — ${lf.label}`,
        };
      break;
    }
    case 2: {
      // Employment Record
      const empMap: Record<number, { path: string; label: string }> = {
        0: { path: "from_date", label: "from date" },
        1: { path: "employer", label: "employer" },
        2: { path: "positions_held", label: "position held" },
        3: { path: "country", label: "country" },
      };
      const em = empMap[cellIndex];
      if (em)
        return {
          dotPath: `employment_record.${rowIndex}.${em.path}`,
          confidence: "mapped",
          label: `Employment ${rowIndex + 1} — ${em.label}`,
        };
      break;
    }
    case 3: {
      // Relevant Projects (WB)
      const projMap: Record<number, { path: string; label: string }> = {
        0: { path: "project_name", label: "project name" },
        1: { path: "date_from", label: "date from" },
        2: { path: "location", label: "location" },
        3: { path: "client", label: "client" },
        4: { path: "positions_held", label: "position held" },
        5: { path: "main_project_features", label: "description" },
      };
      const pm = projMap[cellIndex];
      if (pm)
        return {
          dotPath: `relevant_projects.${rowIndex}.${pm.path}`,
          confidence: "mapped",
          label: `Project ${rowIndex + 1} — ${pm.label}`,
        };
      break;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function locatorToDotPath(
  locator: Locator,
  targetFormat: TargetFormat,
): LocatorMappingResult {
  if (locator.location === "table") {
    const { table_index, row_index, cell_index } = locator;
    const mapped =
      targetFormat === "giz"
        ? gizTableToDotPath(table_index, row_index, cell_index)
        : wbTableToDotPath(table_index, row_index, cell_index);

    if (mapped) return mapped;

    // Unknown table/cell — return fallback so the user can type the correct path
    return {
      dotPath: `table_${table_index}_row_${row_index}_cell_${cell_index}`,
      confidence: "fallback",
      label: `Table ${table_index}, row ${row_index}, cell ${cell_index}`,
    };
  }

  // Paragraph — attempt to identify key_qualifications bullets heuristically
  // by checking whether the text looks like a bullet (starts with action verb or
  // common KQ patterns). Otherwise return a generic fallback.
  const text = locator.text_content.trim();
  const kqPattern = /^[A-Z][a-z]+(?:ed|ing|s)\b/;
  if (kqPattern.test(text)) {
    return {
      dotPath: `key_qualifications.${locator.paragraph_index}`,
      confidence: "fallback",
      label: `Key qualification (paragraph ${locator.paragraph_index})`,
    };
  }

  return {
    dotPath: `paragraph_${locator.paragraph_index}`,
    confidence: "fallback",
    label: `Paragraph ${locator.paragraph_index}`,
  };
}
