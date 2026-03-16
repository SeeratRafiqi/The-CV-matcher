/**
 * Fixed HTML resume template (Anti-CV / LaTeX style).
 * Only placeholder values are replaced; structure and layout stay unchanged.
 */
import type { StructuredResume } from '@/types';

const SECTION_STYLE =
  'font-size:11pt; font-weight:bold; text-transform:uppercase; letter-spacing:0.05em; margin-top:1.25em; margin-bottom:0.65em; padding-bottom:4px; border-bottom:2px solid #1a4568; color:#1a4568; font-family:Helvetica,Arial,sans-serif;';

export const RESUME_HTML_TEMPLATE = `
<div class="resume-page" style="max-width:210mm; margin:0 auto; padding:24px 12.7mm 24px 12.7mm; font-size:11pt; line-height:1.4; color:#222; font-family:Helvetica,Arial,sans-serif; background:#fff; text-align:justify;">
  <header style="margin-bottom:1em;">
    <h1 style="font-size:22pt; font-weight:bold; margin:0 0 0.25em 0; color:#1a4568; font-family:Helvetica,Arial,sans-serif;">{{NAME}}</h1>
    <p style="font-size:10pt; color:#555; margin:0; font-style:italic;">{{CONTACT}}</p>
  </header>

  <section style="margin-bottom:0.75em;">
    <h2 style="${SECTION_STYLE}">Professional Summary</h2>
    <div class="resume-summary" style="white-space:pre-wrap;">{{SUMMARY}}</div>
  </section>

  <section style="margin-bottom:0.75em;">
    <h2 style="${SECTION_STYLE}">Skills</h2>
    <div class="resume-skills">{{SKILLS}}</div>
  </section>

  <section style="margin-bottom:0.75em;">
    <h2 style="${SECTION_STYLE}">Work Experience</h2>
    <div class="resume-experience">{{WORK_EXPERIENCE}}</div>
  </section>

  {{PROJECTS_SECTION}}

  <section style="margin-bottom:0.75em;">
    <h2 style="${SECTION_STYLE}">Education</h2>
    <div class="resume-education">{{EDUCATION}}</div>
  </section>

  {{ACHIEVEMENTS_CERTIFICATIONS_SECTION}}
</div>
`.trim();

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

const HIGHLIGHT_STYLE = 'background:#fef3c7; padding:0 2px; border-radius:1px;';
/** Wrap occurrences of any of the terms (case-insensitive) in the escaped text with <mark>. */
function applyHighlights(escaped: string, terms: string[]): string {
  if (!terms?.length) return escaped;
  const seen = new Set<string>();
  let out = escaped;
  const sorted = [...terms].filter(Boolean).map((t) => t.trim()).filter(Boolean).sort((a, b) => b.length - a.length);
  for (const term of sorted) {
    if (!term || seen.has(term.toLowerCase())) continue;
    seen.add(term.toLowerCase());
    const re = new RegExp(escapeRegex(term), 'gi');
    out = out.replace(re, (match) => `<mark style="${HIGHLIGHT_STYLE}">${match}</mark>`);
  }
  return out;
}
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildContactLine(data: StructuredResume): string {
  const parts: string[] = [];
  if (data.email?.trim()) parts.push(escapeHtml(data.email.trim()));
  if (data.phone?.trim()) parts.push(escapeHtml(data.phone.trim()));
  if (data.linkedIn?.trim()) {
    const url = data.linkedIn.trim().startsWith('http') ? data.linkedIn.trim() : `https://${data.linkedIn.trim()}`;
    parts.push(`<a href="${escapeHtml(url)}" style="color:#555;">${escapeHtml(data.linkedIn.trim())}</a>`);
  }
  if (data.portfolio?.trim()) {
    const url = data.portfolio.trim().startsWith('http') ? data.portfolio.trim() : `https://${data.portfolio.trim()}`;
    parts.push(`<a href="${escapeHtml(url)}" style="color:#555;">${escapeHtml(data.portfolio.trim())}</a>`);
  }
  return parts.join(' &nbsp;|&nbsp; ');
}

/** Options for resume template (e.g. job-relevant terms to highlight). */
export interface PopulateResumeOptions {
  highlightTerms?: string[];
}

/** Replace placeholders in the template with structured resume data. */
export function populateResumeTemplate(data: StructuredResume, options?: PopulateResumeOptions): string {
  const highlightTerms = options?.highlightTerms ?? [];
  const highlight = (raw: string) => applyHighlights(escapeHtml(raw), highlightTerms);

  const name = (data.name || 'Your Name').trim();
  const contactLine = buildContactLine(data);
  const summary = highlight((data.summary || '').trim());

  const skillsHtml =
    data.skills?.length > 0
      ? `<p style="margin:0; line-height:1.4;">${data.skills
          .map((s) => s.trim())
          .filter(Boolean)
          .map((s) => `• ${highlight(s)}`)
          .join(' ')}</p>`
      : '';

  const experienceHtml =
    data.experience?.length > 0
      ? data.experience
          .map((exp) => {
            const title = [exp.role, exp.company].filter(Boolean).join(' — ');
            const dates = exp.dates ? ` &nbsp;|&nbsp; ${highlight(exp.dates)}` : '';
            const bullets =
              (exp.bullets || []).length > 0
                ? `<ul style="margin:0.25em 0 0 0; padding-left:1.25em;">${(exp.bullets || [])
                    .map((b) => b.trim())
                    .filter(Boolean)
                    .map((b) => `<li>${highlight(b)}</li>`)
                    .join('')}</ul>`
                : '';
            return `<p style="margin:0.5em 0 0 0; font-weight:bold;">${highlight(title)}${dates}</p>${bullets}`;
          })
          .join('')
      : '';

  const projectsHtml =
    data.projects?.length > 0
      ? data.projects
          .map((proj) => {
            const namePart = `<p style="margin:0.5em 0 0 0; font-weight:bold;">${highlight((proj.name || 'Project').trim())}</p>`;
            const descPart = proj.description?.trim()
              ? `<p style="margin:0.2em 0 0 0;">${highlight(proj.description.trim())}</p>`
              : '';
            const bullets =
              (proj.bullets || []).length > 0
                ? `<ul style="margin:0.25em 0 0 0; padding-left:1.25em;">${(proj.bullets || [])
                    .map((b) => b.trim())
                    .filter(Boolean)
                    .map((b) => `<li>${highlight(b)}</li>`)
                    .join('')}</ul>`
                : '';
            return `${namePart}${descPart}${bullets}`;
          })
          .join('')
      : '';

  const educationHtml =
    data.education?.length > 0
      ? `<ul style="margin:0; padding-left:1.25em;">${data.education
          .map((edu) => {
            const line = [edu.degree, edu.institution, edu.dates].filter(Boolean).join(' | ');
            return `<li>${highlight(line)}</li>`;
          })
          .join('')}</ul>`
      : '';

  const certsHtml =
    data.certifications?.length > 0
      ? `<ul style="margin:0; padding-left:1.25em;">${data.certifications
          .map((c) => c.trim())
          .filter(Boolean)
          .map((c) => `<li>${highlight(c)}</li>`)
          .join('')}</ul>`
      : '';

  const achievementsHtml =
    data.achievements?.length > 0
      ? `<ul style="margin:0; padding-left:1.25em;">${data.achievements
          .map((a) => a.trim())
          .filter(Boolean)
          .map((a) => `<li>${highlight(a)}</li>`)
          .join('')}</ul>`
      : '';

  const hasAchievementsOrCerts = (data.achievements?.length ?? 0) > 0 || (data.certifications?.length ?? 0) > 0;
  const achievementsCertificationsContent = hasAchievementsOrCerts
    ? [achievementsHtml, certsHtml].filter(Boolean).join('')
    : '';

  const projectsSectionHtml =
    data.projects?.length > 0
      ? `<section style="margin-bottom:0.75em;">
    <h2 style="${SECTION_STYLE}">Projects</h2>
    <div class="resume-projects">${projectsHtml}</div>
  </section>
  `
      : '';

  const achievementsCertificationsSectionHtml = hasAchievementsOrCerts
    ? `<section style="margin-bottom:0.75em;">
    <h2 style="${SECTION_STYLE}">Achievements &amp; Certifications</h2>
    <div class="resume-certifications">${achievementsCertificationsContent}</div>
  </section>
  `
      : '';

  return RESUME_HTML_TEMPLATE.replace(/\{\{NAME\}\}/g, escapeHtml(name))
    .replace(/\{\{CONTACT\}\}/g, contactLine)
    .replace(/\{\{SUMMARY\}\}/g, escapeHtml(summary))
    .replace(/\{\{SKILLS\}\}/g, skillsHtml)
    .replace(/\{\{WORK_EXPERIENCE\}\}/g, experienceHtml)
    .replace(/\{\{PROJECTS_SECTION\}\}/g, projectsSectionHtml)
    .replace(/\{\{EDUCATION\}\}/g, educationHtml)
    .replace(/\{\{ACHIEVEMENTS_CERTIFICATIONS_SECTION\}\}/g, achievementsCertificationsSectionHtml);
}
