import type { TailoredCvDocument } from '@/types/cv'

/**
 * The printable form of a tailored CV.
 *
 * Kept apart from cv-pdf.ts, which owns the native side — printing, renaming,
 * the share sheet. This half is a pure string function over the document, so
 * the layout can be rendered and looked at without a device in the loop.
 *
 * The layout is deliberately plain: one column, no tables, no background
 * colours, real headings. Employer-side CV screeners parse text, and a design
 * that reads beautifully to a person while defeating the parser costs the
 * candidate the application.
 */

/** Model output is untrusted markup-wise: a stray `<` would break the page. */
const escape = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const escapeAll = (values: string[]) => values.map(escape)

/** "Jan 2021 — Present", or whichever half exists. */
const dateRange = (start: string | null, end: string | null) => {
  if (start && end) return `${start} — ${end}`
  return start || end || ''
}

const bulletList = (bullets: string[]) =>
  bullets.length > 0
    ? `<ul>${escapeAll(bullets).map((bullet) => `<li>${bullet}</li>`).join('')}</ul>`
    : ''

/** A section is only drawn when it has content; empty headings read as a gap. */
const section = (title: string, body: string) =>
  body.trim() ? `<section><h2>${escape(title)}</h2>${body}</section>` : ''

const contactLine = (document: TailoredCvDocument) =>
  [
    document.contact?.email,
    document.contact?.phone,
    document.contact?.location,
    ...(document.contact?.links ?? []),
  ]
    .filter((part): part is string => Boolean(part))
    .map(escape)
    .join(' &nbsp;·&nbsp; ')

const experienceHtml = (document: TailoredCvDocument) =>
  document.experience
    .map((role) => {
      const heading = [role.role, role.company].filter(Boolean).map(escape).join(' — ')
      const meta = [dateRange(role.start_date, role.end_date), role.location]
        .filter(Boolean)
        .map((part) => escape(String(part)))
        .join(' · ')

      return `
        <article>
          <div class="row"><h3>${heading}</h3><span class="meta">${meta}</span></div>
          ${bulletList(role.bullets)}
        </article>`
    })
    .join('')

const educationHtml = (document: TailoredCvDocument) =>
  document.education
    .map((entry) => {
      const heading = [entry.qualification, entry.institution].filter(Boolean).map(escape).join(' — ')
      const meta = [dateRange(entry.start_date, entry.end_date), entry.location]
        .filter(Boolean)
        .map((part) => escape(String(part)))
        .join(' · ')

      return `
        <article>
          <div class="row"><h3>${heading}</h3><span class="meta">${meta}</span></div>
          ${entry.details ? `<p>${escape(entry.details)}</p>` : ''}
        </article>`
    })
    .join('')

const projectsHtml = (document: TailoredCvDocument) =>
  document.projects
    .map(
      (project) => `
        <article>
          <div class="row"><h3>${escape(project.name)}</h3></div>
          ${project.description ? `<p>${escape(project.description)}</p>` : ''}
          ${bulletList(project.bullets)}
        </article>`
    )
    .join('')

/** The printable CV. Self-contained: expo-print loads no external resources. */
export const buildCvHtml = (document: TailoredCvDocument): string => {
  const contact = contactLine(document)

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      @page { size: A4; margin: 15mm 14mm; }
      * { box-sizing: border-box; }
      body {
        font-family: Helvetica, Arial, sans-serif;
        color: #16181d;
        font-size: 10.5pt;
        line-height: 1.45;
        margin: 0;
      }
      header { border-bottom: 1.5pt solid #16181d; padding-bottom: 8pt; margin-bottom: 12pt; }
      h1 { font-size: 20pt; margin: 0 0 2pt; letter-spacing: 0.2pt; }
      .headline { font-size: 11pt; color: #4a4f5a; margin: 0 0 5pt; }
      .contact { font-size: 9pt; color: #4a4f5a; }
      section { margin-bottom: 12pt; }
      h2 {
        font-size: 10pt; text-transform: uppercase; letter-spacing: 1pt;
        border-bottom: 0.6pt solid #c7cad1;
        padding-bottom: 3pt; margin: 0 0 7pt;
      }
      article { margin-bottom: 9pt; }
      /* Roles must not be split across a page break mid-bullet. */
      article, li { page-break-inside: avoid; }
      .row { display: flex; justify-content: space-between; align-items: baseline; gap: 10pt; }
      h3 { font-size: 10.5pt; margin: 0; }
      .meta { font-size: 9pt; color: #4a4f5a; white-space: nowrap; }
      p { margin: 3pt 0; }
      ul { margin: 4pt 0 0; padding-left: 14pt; }
      li { margin-bottom: 2.5pt; }
      .skills { margin: 0; }
    </style>
  </head>
  <body>
    <header>
      <h1>${escape(document.full_name || 'Curriculum Vitae')}</h1>
      ${document.headline ? `<p class="headline">${escape(document.headline)}</p>` : ''}
      ${contact ? `<div class="contact">${contact}</div>` : ''}
    </header>

    ${section('Professional Summary', document.summary ? `<p>${escape(document.summary)}</p>` : '')}
    ${section(
      'Core Skills',
      document.skills.length ? `<p class="skills">${escapeAll(document.skills).join(' &nbsp;·&nbsp; ')}</p>` : ''
    )}
    ${section('Experience', experienceHtml(document))}
    ${section('Projects', projectsHtml(document))}
    ${section('Education', educationHtml(document))}
    ${section('Certifications', bulletList(document.certifications))}
  </body>
</html>`
}

