import { APP_NAME } from "../lib/brand";

const CONTACT_EMAIL =
  (import.meta.env.VITE_CONTACT_EMAIL as string | undefined)?.trim() || "";

const LAST_UPDATED = "June 10, 2026";
const JURISDICTION = "England and Wales";
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

The reformatting is done by AI, and AI gets things wrong sometimes — a date dropped, a title mixed up, a line that reads oddly. **Always read the output before you use it.** Think of the tool as a fast first draft, not a final word. It speeds up your work; it doesn't replace your judgment, and we can't promise the output is error-free or right for every purpose.

## Using it fairly

A few common-sense limits: don't upload things you're not allowed to, don't try to break or overload the service, and don't use it for anything unlawful. To keep things running smoothly for everyone, we may cap how many sessions you can run at once.

## Who owns what

Your files and the documents we generate for you are yours. The tool itself — the software, the templates, the design — is ours. You're free to use it for what it's built for.

## When things go wrong

We work to keep the service up and reliable, but we can't guarantee it's always available or always perfect, and we can't be responsible for what happens if you rely on AI output without checking it. Some protections can't be signed away under the law, and we don't try to.

## Leaving

You can stop using ${APP_NAME} and ask us to delete your account whenever you like. We may close an account that's being misused.


---

# How we handle your data

## Our two roles

There are two kinds of data here, and we treat them differently:

- **Your account info** (your email, basically) — that's ours to look after, and we're responsible for it.
- **The CVs and ToRs you upload** — these belong to your work. You're the one in charge of that data; we just process it on your instructions and store it securely. Keeping the candidates informed is your call, because it's your relationship with them.

## What we collect

- **Your account:** email and login details.
- **What you upload:** the CV and optional ToR. CVs usually hold a lot — name, contact details, work history, education, languages, and so on.
- **What you type in:** proposed position, job description, category, employer, years with the firm, page limit, and any comments you add.
- **What we generate:** the finished document and the structured data we build along the way.
- **Behind the scenes:** session IDs, timestamps, and basic logs that keep the tool running and help us fix issues.

## What we do with it

We use it to run the service — store your files, do the reformatting, and give you the result. Nothing more exciting than that.

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

If you're in a region like the EU, people have rights over their personal data — to see it, correct it, delete it, or object to how it's used. Since most of what we hold is candidate data rather than yours, a candidate's request is usually best handled by whoever uploaded their CV; we'll help that organization respond. For anything about your own account, just email ${CONTACT_EMAIL}.



${CONTACT_EMAIL}
`;
