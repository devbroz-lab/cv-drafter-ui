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

import type { CompositeCellOption, GeneratedField, TargetFormat } from "../types";

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
  // Data rows start at rowIndex 1; convert to zero-based array index.
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
          label: `Project ${i + 1} — name / features`,
          options: [
            { label: "Project Name",          dotPath: `relevant_projects[${i}].project_name`          },
            { label: "Main Project Features", dotPath: `relevant_projects[${i}].main_project_features` },
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
      // cell 0: period
      // cell 1: employer + position (composite — two paragraphs in one cell)
      // cell 2: country
      if (cellIndex === 0)
        return {
          kind: "simple",
          dotPath: `employment_record[${i}].period`,
          confidence: "mapped",
          label: `Employment ${i + 1} — period`,
        };
      if (cellIndex === 1)
        return {
          kind: "composite",
          dotPath: "",
          confidence: "mapped",
          label: `Employment ${i + 1} — employer / position`,
          options: [
            { label: "Employer", dotPath: `employment_record[${i}].employer` },
            { label: "Position", dotPath: `employment_record[${i}].position` },
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

  // Paragraph — attempt to identify key_qualifications bullets heuristically.
  const text = locator.text_content.trim();
  const kqPattern = /^[A-Z][a-z]+(?:ed|ing|s)\b/;
  if (kqPattern.test(text)) {
    return {
      kind: "simple",
      dotPath: `key_qualifications[${locator.paragraph_index}]`,
      confidence: "fallback",
      label: `Key qualification (paragraph ${locator.paragraph_index})`,
    };
  }

  return {
    kind: "simple",
    dotPath: `paragraph_${locator.paragraph_index}`,
    confidence: "fallback",
    label: `Paragraph ${locator.paragraph_index}`,
  };
}
