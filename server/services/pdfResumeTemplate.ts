import { PDFDocument, rgb, StandardFonts, RGB, PDFPage } from 'pdf-lib';

// A4
const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 50;
const TOP_CONTENT_PADDING = 24;   // Extra space below header / top of page
const BOTTOM_MARGIN = 45;  // Min Y before starting a new page (adds bottom padding)
const CONTINUATION_TOP = 18;  // Extra top padding on page 2+ so content doesn't sit flush
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const BULLET_INDENT = 14;
const TITLE_TO_LINE_GAP = 7;               // Space between section title text and the underline
const SECTION_TITLE_TO_CONTENT_GAP = 8;  // Space between section title underline and first line

// Professional template colours (Canva/Overleaf style: navy accent, clean body)
const ACCENT: RGB = rgb(0.11, 0.27, 0.42);       // Navy blue
const ACCENT_LIGHT: RGB = rgb(0.2, 0.4, 0.6);   // Lighter navy for bar
const TEXT_DARK: RGB = rgb(0.15, 0.15, 0.15);
const TEXT_MUTED: RGB = rgb(0.35, 0.35, 0.35);

const FONT_SIZE_BODY = 10;
const FONT_SIZE_SECTION = 12;
const FONT_SIZE_HEADER_NAME = 18;
const FONT_SIZE_HEADER_CONTACT = 9;
const LINE_HEIGHT_BODY = 14;
const LINE_HEIGHT_SECTION = 16;
const TOP_BAR_HEIGHT = 28;
const SECTION_GAP = 14;
const ENTRY_GAP = 6;

/** Min space needed for a section header so we don't orphan the title at page bottom. */
const SECTION_HEADER_MIN_HEIGHT = LINE_HEIGHT_SECTION + TITLE_TO_LINE_GAP + 4 + SECTION_TITLE_TO_CONTENT_GAP + LINE_HEIGHT_BODY * 2;

/** Y position for first content line on a continuation page (page 2+). */
function continuationY(): number {
  return PAGE_HEIGHT - MARGIN - CONTINUATION_TOP - 8;
}

/** True if we need a new page before drawing another line. */
function needsNewPage(y: number, lineHeight: number = LINE_HEIGHT_BODY): boolean {
  return y < BOTTOM_MARGIN + lineHeight;
}

export interface StructuredResumeData {
  name: string;
  email: string;
  phone: string;
  linkedIn: string;
  portfolio: string;
  summary: string;
  skills: string[];
  experience: { role: string; company: string; dates?: string; bullets: string[] }[];
  education: { degree: string; institution: string; dates?: string }[];
  projects: { name: string; description?: string; bullets?: string[] }[];
  achievements?: string[];
  certifications: string[];
}

/** Strip HTML tags so PDF shows plain text only (no raw <mark> or other tags). */
function stripHtml(text: string): string {
  if (typeof text !== 'string') return '';
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

/** Detect if a line looks like a section header (e.g. EXPERIENCE, Education, Skills). */
function isSectionHeader(line: string): boolean {
  const t = line.trim();
  if (t.length > 50) return false;
  const upper = t.toUpperCase();
  const common = [
    'EXPERIENCE', 'WORK EXPERIENCE', 'LEADERSHIP EXPERIENCE', 'EDUCATION', 'SKILLS', 'SUMMARY', 'PROFILE',
    'PROJECTS', 'CERTIFICATIONS', 'AWARDS', 'LANGUAGES', 'REFERENCES',
    'OBJECTIVE', 'QUALIFICATIONS', 'TECHNICAL SKILLS', 'SOFT SKILLS', 'INTERESTS'
  ];
  if (common.some((h) => upper === h || upper.startsWith(h + ':') || upper.startsWith(h + ' ') || upper.includes(h))) return true;
  if (/^[A-Z][A-Z\s\-]{2,35}$/.test(t) || (t.endsWith(':') && t.length < 40)) return true;
  if (/^(Experience|Education|Skills|Summary|Profile|Projects|Certifications)/i.test(t) && t.length < 40) return true;
  return false;
}

/** Split tailored text into sections (header + content lines). */
function parseSections(text: string): { title: string; lines: string[] }[] {
  const lines = (text || '').trim().split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [{ title: 'Resume', lines: [] }];

  const sections: { title: string; lines: string[] }[] = [];
  let current: { title: string; lines: string[] } | null = null;

  for (const line of lines) {
    if (isSectionHeader(line)) {
      current = { title: line.replace(/:$/, '').trim(), lines: [] };
      sections.push(current);
    } else if (current) {
      current.lines.push(line);
    } else {
      current = { title: 'Profile', lines: [line] };
      sections.push(current);
    }
  }
  return sections.length ? sections : [{ title: 'Resume', lines }];
}

/** Draw wrapped text and return new y (no page break). */
function drawWrapped(
  page: PDFPage,
  font: any,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  size: number,
  color: RGB,
  lineHeight: number
): number {
  const words = (text || '').trim().split(/\s+/).filter(Boolean);
  let run: string[] = [];
  for (const word of words) {
    const testRun = run.length ? [...run, word].join(' ') : word;
    const w = font.widthOfTextAtSize(testRun, size);
    if (w <= maxWidth) {
      run.push(word);
    } else {
      if (run.length) {
        page.drawText(run.join(' '), { x, y, size, font, color });
        y -= lineHeight;
        run = [word];
      } else {
        page.drawText(word, { x, y, size, font, color });
        y -= lineHeight;
      }
    }
  }
  if (run.length) {
    page.drawText(run.join(' '), { x, y, size, font, color });
    y -= lineHeight;
  }
  return y;
}

/** Draw wrapped text with page breaks; returns current page and y. */
function drawWrappedWithPagination(
  doc: PDFDocument,
  page: PDFPage,
  font: any,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  size: number,
  color: RGB,
  lineHeight: number
): { page: PDFPage; y: number } {
  const words = (text || '').trim().split(/\s+/).filter(Boolean);
  let currentPage = page;
  let currentY = y;
  let run: string[] = [];

  const flush = () => {
    if (run.length === 0) return;
    if (needsNewPage(currentY, lineHeight)) {
      currentPage = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      currentY = continuationY();
    }
    currentPage.drawText(run.join(' '), { x, y: currentY, size, font, color });
    currentY -= lineHeight;
    run = [];
  };

  for (const word of words) {
    const testRun = run.length ? [...run, word].join(' ') : word;
    const w = font.widthOfTextAtSize(testRun, size);
    if (w <= maxWidth) {
      run.push(word);
    } else {
      flush();
      if (font.widthOfTextAtSize(word, size) <= maxWidth) {
        run = [word];
      } else {
        if (needsNewPage(currentY, lineHeight)) {
          currentPage = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
          currentY = continuationY();
        }
        currentPage.drawText(word, { x, y: currentY, size, font, color });
        currentY -= lineHeight;
      }
    }
  }
  flush();
  return { page: currentPage, y: currentY };
}

/** Draw wrapped text with first line bold, continuation lines regular (so wrapped "titles" don't look like sub-titles). */
function drawWrappedBoldFirstLine(
  doc: PDFDocument,
  page: PDFPage,
  font: any,
  fontBold: any,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  size: number,
  color: RGB,
  lineHeight: number
): { page: PDFPage; y: number } {
  const words = (text || '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return { page, y };
  let currentPage = page;
  let currentY = y;
  let run: string[] = [];
  let isFirstLine = true;

  const flush = (useBold: boolean) => {
    if (run.length === 0) return;
    if (needsNewPage(currentY, lineHeight)) {
      currentPage = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      currentY = continuationY();
    }
    currentPage.drawText(run.join(' '), {
      x,
      y: currentY,
      size,
      font: useBold ? fontBold : font,
      color,
    });
    currentY -= lineHeight;
    run = [];
  };

  for (const word of words) {
    const testRun = run.length ? [...run, word].join(' ') : word;
    const measureFont = isFirstLine ? fontBold : font;
    const w = measureFont.widthOfTextAtSize(testRun, size);
    if (w <= maxWidth) {
      run.push(word);
    } else {
      flush(isFirstLine);
      isFirstLine = false;
      if (font.widthOfTextAtSize(word, size) <= maxWidth) {
        run = [word];
      } else {
        if (needsNewPage(currentY, lineHeight)) {
          currentPage = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
          currentY = continuationY();
        }
        currentPage.drawText(word, { x, y: currentY, size, font, color });
        currentY -= lineHeight;
      }
    }
  }
  flush(isFirstLine);
  return { page: currentPage, y: currentY };
}

/** Draw a section title (navy, bold, accent line). Returns page and new y. Starts new page if not enough room to avoid orphaned headers. */
function drawSectionTitle(
  page: PDFPage,
  fontBold: any,
  title: string,
  y: number,
  doc: PDFDocument
): { page: PDFPage; y: number } {
  let currentPage = page;
  let py = y;
  if (needsNewPage(py, SECTION_HEADER_MIN_HEIGHT)) {
    currentPage = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    py = continuationY();
  }
  currentPage.drawText(title, {
    x: MARGIN,
    y: py,
    size: FONT_SIZE_SECTION,
    font: fontBold,
    color: ACCENT,
  });
  py -= LINE_HEIGHT_SECTION;
  py -= TITLE_TO_LINE_GAP;
  currentPage.drawRectangle({
    x: MARGIN,
    y: py + 2,
    width: CONTENT_WIDTH,
    height: 2,
    color: ACCENT,
  });
  py -= SECTION_TITLE_TO_CONTENT_GAP;
  return { page: currentPage, y: py };
}

/**
 * Build a professional resume PDF from structured data (header, summary, skills, experience, education, etc.)
 * with proper bullets, spacing, and hierarchy.
 */
export async function buildPdfFromStructuredResume(data: StructuredResumeData): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN - TOP_CONTENT_PADDING;

  // Top accent bar
  page.drawRectangle({
    x: 0,
    y: PAGE_HEIGHT - TOP_BAR_HEIGHT,
    width: PAGE_WIDTH,
    height: TOP_BAR_HEIGHT,
    color: ACCENT_LIGHT,
  });
 

  // Header: name (large, centered or left)
  const name = stripHtml(data.name || 'Resume').trim() || 'Resume';
  if (name) {
    page.drawText(name, {
      x: MARGIN,
      y,
      size: FONT_SIZE_HEADER_NAME,
      font: fontBold,
      color: ACCENT,
    });
    y -= FONT_SIZE_HEADER_NAME + 4;
  }

  // Contact line: email | phone | LinkedIn | portfolio
  const contactParts: string[] = [];
  if (data.email?.trim()) contactParts.push(stripHtml(data.email).trim());
  if (data.phone?.trim()) contactParts.push(stripHtml(data.phone).trim());
  if (data.linkedIn?.trim()) contactParts.push(stripHtml(data.linkedIn).trim());
  if (data.portfolio?.trim()) contactParts.push(stripHtml(data.portfolio).trim());
  const contactLine = contactParts.join('  •  ');
  if (contactLine) {
    if (needsNewPage(y, FONT_SIZE_HEADER_CONTACT + 4)) {
      page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = continuationY();
    }
    page.drawText(contactLine, {
      x: MARGIN,
      y,
      size: FONT_SIZE_HEADER_CONTACT,
      font,
      color: TEXT_MUTED,
    });
    y -= FONT_SIZE_HEADER_CONTACT + 8;
  }
  y -= 4;

  const maxWidth = CONTENT_WIDTH - 4;
  const bulletMaxWidth = maxWidth - BULLET_INDENT;

  // Professional Summary
  if (data.summary?.trim()) {
    const out = drawSectionTitle(page, fontBold, 'Professional Summary', y, doc);
    page = out.page;
    y = out.y;
    const sumOut = drawWrappedWithPagination(doc, page, font, stripHtml(data.summary).trim(), MARGIN, y, maxWidth, FONT_SIZE_BODY, TEXT_DARK, LINE_HEIGHT_BODY);
    page = sumOut.page;
    y = sumOut.y - SECTION_GAP;
  }

  // Skills
  if (data.skills?.length) {
    const out = drawSectionTitle(page, fontBold, 'Skills', y, doc);
    page = out.page;
    y = out.y;
    const skillsText = data.skills.map((s) => stripHtml(s).trim()).filter(Boolean).join('  •  ');
    if (skillsText) {
      const skOut = drawWrappedWithPagination(doc, page, font, skillsText, MARGIN, y, maxWidth, FONT_SIZE_BODY, TEXT_DARK, LINE_HEIGHT_BODY);
      page = skOut.page;
      y = skOut.y;
    }
    y -= SECTION_GAP;
  }

  // Work Experience
  if (data.experience?.length) {
    const out = drawSectionTitle(page, fontBold, 'Work Experience', y, doc);
    page = out.page;
    y = out.y;
    for (const exp of data.experience) {
      if (needsNewPage(y, LINE_HEIGHT_BODY * 4)) {
        page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
        y = continuationY();
      }
      const roleCompany = [stripHtml(exp.role), stripHtml(exp.company)].filter(Boolean).join(' — ');
      const sub = exp.dates ? `${roleCompany}  |  ${stripHtml(exp.dates)}` : roleCompany;
      const expTitleOut = drawWrappedBoldFirstLine(doc, page, font, fontBold, sub, MARGIN, y, maxWidth, FONT_SIZE_BODY, TEXT_DARK, LINE_HEIGHT_BODY);
      page = expTitleOut.page;
      y = expTitleOut.y;
      for (const bullet of exp.bullets || []) {
        const b = stripHtml(bullet || '').trim();
        if (!b) continue;
        const bOut = drawWrappedWithPagination(doc, page, font, `• ${b}`, MARGIN + BULLET_INDENT, y, bulletMaxWidth, FONT_SIZE_BODY, TEXT_DARK, LINE_HEIGHT_BODY);
        page = bOut.page;
        y = bOut.y;
      }
      y -= ENTRY_GAP;
    }
    y -= SECTION_GAP;
  }

  // Projects
  if (data.projects?.length) {
    const out = drawSectionTitle(page, fontBold, 'Projects', y, doc);
    page = out.page;
    y = out.y;
    for (const proj of data.projects) {
      if (needsNewPage(y, LINE_HEIGHT_BODY * 3)) {
        page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
        y = continuationY();
      }
      const title = stripHtml(proj.name || '').trim() || 'Project';
      const projTitleOut = drawWrappedBoldFirstLine(doc, page, font, fontBold, title, MARGIN, y, maxWidth, FONT_SIZE_BODY, TEXT_DARK, LINE_HEIGHT_BODY);
      page = projTitleOut.page;
      y = projTitleOut.y;
      const desc = stripHtml(proj.description || '').trim();
      if (desc) {
        const dOut = drawWrappedWithPagination(doc, page, font, desc, MARGIN + BULLET_INDENT, y, bulletMaxWidth, FONT_SIZE_BODY, TEXT_DARK, LINE_HEIGHT_BODY);
        page = dOut.page;
        y = dOut.y;
      }
      for (const bullet of proj.bullets || []) {
        const b = stripHtml(bullet || '').trim();
        if (!b) continue;
        const bOut = drawWrappedWithPagination(doc, page, font, `• ${b}`, MARGIN + BULLET_INDENT, y, bulletMaxWidth, FONT_SIZE_BODY, TEXT_DARK, LINE_HEIGHT_BODY);
        page = bOut.page;
        y = bOut.y;
      }
      y -= ENTRY_GAP;
    }
    y -= SECTION_GAP;
  }

  // Education
  if (data.education?.length) {
    const out = drawSectionTitle(page, fontBold, 'Education', y, doc);
    page = out.page;
    y = out.y;
    for (const edu of data.education) {
      if (needsNewPage(y, LINE_HEIGHT_BODY * 2)) {
        page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
        y = continuationY();
      }
      const line = [stripHtml(edu.degree), stripHtml(edu.institution), stripHtml(edu.dates || '')].filter(Boolean).join('  |  ');
      page.drawText(line, {
        x: MARGIN,
        y,
        size: FONT_SIZE_BODY,
        font,
        color: TEXT_DARK,
      });
      y -= LINE_HEIGHT_BODY + 2;
    }
    y -= SECTION_GAP;
  }

  // Achievements & Certifications (only if at least one has content)
  const achievements = (data.achievements ?? []).map((a) => stripHtml(a).trim()).filter(Boolean);
  const certs = (data.certifications ?? []).map((c) => stripHtml(c).trim()).filter(Boolean);
  if (achievements.length > 0 || certs.length > 0) {
    const out = drawSectionTitle(page, fontBold, 'Achievements & Certifications', y, doc);
    page = out.page;
    y = out.y;
    const parts: string[] = [...achievements, ...certs];
    const combinedText = parts.join('  •  ');
    if (combinedText) {
      const cOut = drawWrappedWithPagination(doc, page, font, combinedText, MARGIN, y, maxWidth, FONT_SIZE_BODY, TEXT_DARK, LINE_HEIGHT_BODY);
      page = cOut.page;
      y = cOut.y;
    }
    y -= SECTION_GAP;
  }

  const bytes = await doc.save();
  return Buffer.from(bytes);
}

/**
 * Build a professional resume PDF from tailored text using a clean modern template
 * (Canva/Overleaf style: top accent bar, section headers in navy, readable body text).
 */
export async function buildPdfWithProfessionalTemplate(tailoredText: string): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const sections = parseSections(tailoredText);
  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  // Top accent bar
  page.drawRectangle({
    x: 0,
    y: PAGE_HEIGHT - TOP_BAR_HEIGHT,
    width: PAGE_WIDTH,
    height: TOP_BAR_HEIGHT,
    color: ACCENT_LIGHT,
  });

  y -= TOP_BAR_HEIGHT + 20;

  for (const section of sections) {
    // Section title: ensure we have room so the title is not orphaned at the bottom of the page
    const sectionTitle = stripHtml(section.title.replace(/:$/, '')).trim();
    if (needsNewPage(y, SECTION_HEADER_MIN_HEIGHT)) {
      page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = continuationY();
    }
    page.drawText(sectionTitle, {
      x: MARGIN,
      y,
      size: FONT_SIZE_SECTION,
      font: fontBold,
      color: ACCENT,
    });
    y -= LINE_HEIGHT_SECTION;
    y -= TITLE_TO_LINE_GAP;
    // Accent line under section title
    page.drawRectangle({
      x: MARGIN,
      y: y + 2,
      width: 36,
      height: 2,
      color: ACCENT,
    });
    y -= SECTION_TITLE_TO_CONTENT_GAP;

    // Section content (word-wrap) with proper page breaks
    const maxWidth = CONTENT_WIDTH - 4;
    for (const line of section.lines) {
      const plainLine = stripHtml(line);
      const words = plainLine.split(/\s+/).filter(Boolean);
      let run: string[] = [];

      for (const word of words) {
        const testRun = run.length ? [...run, word].join(' ') : word;
        const w = font.widthOfTextAtSize(testRun, FONT_SIZE_BODY);
        if (w <= maxWidth) {
          run.push(word);
        } else {
          if (run.length) {
            if (needsNewPage(y)) {
              page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
              y = continuationY();
            }
            page.drawText(run.join(' '), {
              x: MARGIN,
              y,
              size: FONT_SIZE_BODY,
              font,
              color: TEXT_DARK,
            });
            y -= LINE_HEIGHT_BODY;
            run = [word];
          } else {
            if (needsNewPage(y)) {
              page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
              y = continuationY();
            }
            page.drawText(word, {
              x: MARGIN,
              y,
              size: FONT_SIZE_BODY,
              font,
              color: TEXT_DARK,
            });
            y -= LINE_HEIGHT_BODY;
          }
        }
      }
      if (run.length) {
        if (needsNewPage(y)) {
          page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
          y = continuationY();
        }
        page.drawText(run.join(' '), {
          x: MARGIN,
          y,
          size: FONT_SIZE_BODY,
          font,
          color: TEXT_DARK,
        });
        y -= LINE_HEIGHT_BODY;
      }
    }
    y -= SECTION_GAP;
  }

  const bytes = await doc.save();
  return Buffer.from(bytes);
}
