import { APP_NAME } from "../lib/brand";

const CONTACT_EMAIL =
  (import.meta.env.VITE_CONTACT_EMAIL as string | undefined)?.trim() || "";

const LAST_UPDATED = "June 10, 2026";
// const JURISDICTION = "England and Wales";
const DATA_REGION = "the EU";

/** Terms & privacy copy shown before Google sign-in. */
export const TERMS_AND_PRIVACY_MARKDOWN = `# Terms and Privacy Policy

*${APP_NAME} — last updated ${LAST_UPDATED}*

We built ${APP_NAME} to take the grind out of reformatting CVs into donor templates like GIZ and World Bank. This page explains the deal between us: what the tool does, what we ask of you, and how we look after the data you put into it. It's written to be read, not skimmed  ${CONTACT_EMAIL}.

By creating an account, you're agreeing to what's below.

---

## How it works

You upload a CV (and, if you have one, a Terms of Reference document plus a few job details). The tool reads the text, runs it through an AI pipeline, and hands you back a reformatted Word document. You review it, tweak if needed, and download.

It's a tool for professionals — recruiters, consulting firms, and teams putting together donor bids. You'll need to be 18 or over and authorized to act for your organization.

## The one thing we really need from you

Here's the part worth slowing down for. The CVs you upload are almost always about *someone else* — the candidate. That person's information is personal data, and they're trusting that it's handled properly.

So whenever you upload a CV or ToR, you're confirming that:

- You're allowed to use that person's information this way.
- You've given them whatever notice the law requires, and have any consent you need.
- The document is yours to share — nothing confidential you shouldn't be passing on.
- The details you've entered are accurate as far as you know.

We ask you to confirm this each time you start a session. It's not red tape — it's how we keep the tool trustworthy for the people whose CVs pass through it.

## About the AI output

${APP_NAME} is designed to work in collaboration with you. It handles the structured, time-consuming work of reformatting and produces a draft for your review; it is not intended to replace your judgment, expertise, or oversight. As with any AI-assisted tool, automated output can reflect the inherent limitations of the technology, so human review remains an essential part of the process. We recommend reading each document before you use it to confirm that names, dates, and other details have carried through as intended.

## Leaving

You can stop using ${APP_NAME} and ask us to delete your account whenever you like. We may close an account that's being misused.


---

# How we handle your data

## What we collect

- **Your account:** email and login details.
- **What you upload:** the CV and optional ToR. CVs usually hold a lot — name, contact details, work history, education, languages, and so on.
- **What you type in:** proposed position, job description, category, employer, years with the firm, page limit, and any comments you add.
- **What we generate:** the finished document and the structured data we build along the way.
- **Behind the scenes:** session IDs, timestamps, and basic logs that keep the tool running and help us fix issues.

## What we do with it

We use it to run the service and give you the result. Nothing more exciting than that.

## Who else touches it

Two trusted services help us run ${APP_NAME}:

- **Supabase** handles sign-in, the database, and file storage. Your data lives in ${DATA_REGION} and is encrypted both in transit and at rest.
- **Anthropic** powers the AI reformatting. The text is sent to its API for processing and **is not used to train its models** — that's covered by the commercial terms the API runs under. You can [read more](https://www.anthropic.com/legal/privacy).

Some of this processing may happen outside your country. When it does, it's covered by standard data-protection safeguards between us and those providers.

## How long we keep it

> We delete uploaded files and generated documents within 90 days after a session finishes, and remove your account data within 30 days of closure. If you need something removed sooner, email us.

## Keeping it safe

Your data is tied to your account and isn't visible to other users. Files are encrypted, and the download links we generate expire after a short while, so a stray link doesn't stay live. Internally, only the people who need access to run the service have it.

## Your rights

If you're in a region like the EU, people have rights over their personal data — to see it, correct it, delete it, or object to how it's used. Since most of what we hold is candidate data rather than yours, a candidate's request is usually best handled by whoever uploaded their CV; we'll help that organization respond.



`;
