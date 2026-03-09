import { PDFDocument, rgb, StandardFonts, RGB, PDFPage } from 'pdf-lib';

// A4
const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 50;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const BULLET_INDENT = 14;

// Professional template colours (Canva/Overleaf style: navy accent, clean body)
const ACCENT: RGB = rgb(0.11, 0.27, 0.42);       // Navy blue
const ACCENT_LIGHT: RGB = rgb(0.2, 0.4, 0.6);   // Lighter navy for bar
const TEXT_DARK: RGB = rgb(0.15, 0.15, 0.15);
const TEXT_MUTED: RGB = rgb(0.35, 0.35, 0.35);

const FONT_SIZE_BODY = 10;
const FONT_SIZE_SECTION = 12;
const FONT_SIZE_HEADER_NAME = 18;
const FONT_SIZE_HEADER_CONTACT = 9;
const LINE_HEIGHT_BODY = 13;
const LINE_HEIGHT_SECTION = 16;
const TOP_BAR_HEIGHT = 28;
const SECTION_GAP = 8;
const ENTRY_GAP = 6;

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
  certifications: string[];
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
    if (currentY < MARGIN + size) {
      currentPage = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      currentY = PAGE_HEIGHT - MARGIN;
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
        if (currentY < MARGIN + size) {
          currentPage = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
          currentY = PAGE_HEIGHT - MARGIN;
        }
        currentPage.drawText(word, { x, y: currentY, size, font, color });
        currentY -= lineHeight;
      }
    }
  }
  flush();
  return { page: currentPage, y: currentY };
}

/** Draw a section title (navy, bold, accent line). Returns page and new y. */
function drawSectionTitle(
  page: PDFPage,
  fontBold: any,
  title: string,
  y: number,
  doc: PDFDocument
): { page: PDFPage; y: number } {
  let currentPage = page;
  let py = y;
  if (py < MARGIN + LINE_HEIGHT_SECTION + 30) {
    currentPage = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    py = PAGE_HEIGHT - MARGIN;
  }
  currentPage.drawText(title, {
    x: MARGIN,
    y: py,
    size: FONT_SIZE_SECTION,
    font: fontBold,
    color: ACCENT,
  });
  py -= LINE_HEIGHT_SECTION;
  currentPage.drawRectangle({
    x: MARGIN,
    y: py + 2,
    width: 36,
    height: 2,
    color: ACCENT,
  });
  py -= 6;
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
  let y = PAGE_HEIGHT - MARGIN;

  // Top accent bar
  page.drawRectangle({
    x: 0,
    y: PAGE_HEIGHT - TOP_BAR_HEIGHT,
    width: PAGE_WIDTH,
    height: TOP_BAR_HEIGHT,
    color: ACCENT_LIGHT,
  });
  y -= TOP_BAR_HEIGHT + 16;

  // Header: name (large, centered or left)
  const name = (data.name || 'Resume').trim();
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
  if (data.email?.trim()) contactParts.push(data.email.trim());
  if (data.phone?.trim()) contactParts.push(data.phone.trim());
  if (data.linkedIn?.trim()) contactParts.push(data.linkedIn.trim());
  if (data.portfolio?.trim()) contactParts.push(data.portfolio.trim());
  const contactLine = contactParts.join('  •  ');
  if (contactLine) {
    if (y < MARGIN + FONT_SIZE_HEADER_CONTACT) {
      page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
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
    const sumOut = drawWrappedWithPagination(doc, page, font, data.summary.trim(), MARGIN, y, maxWidth, FONT_SIZE_BODY, TEXT_DARK, LINE_HEIGHT_BODY);
    page = sumOut.page;
    y = sumOut.y - SECTION_GAP;
  }

  // Skills
  if (data.skills?.length) {
    const out = drawSectionTitle(page, fontBold, 'Skills', y, doc);
    page = out.page;
    y = out.y;
    const skillsText = data.skills.map((s) => s.trim()).filter(Boolean).join('  •  ');
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
      if (y < MARGIN + LINE_HEIGHT_BODY * 4) {
        page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
        y = PAGE_HEIGHT - MARGIN;
      }
      const roleCompany = [exp.role, exp.company].filter(Boolean).join(' — ');
      const sub = exp.dates ? `${roleCompany}  |  ${exp.dates}` : roleCompany;
      page.drawText(sub, {
        x: MARGIN,
        y,
        size: FONT_SIZE_BODY,
        font: fontBold,
        color: TEXT_DARK,
      });
      y -= LINE_HEIGHT_BODY;
      for (const bullet of exp.bullets || []) {
        if (!bullet?.trim()) continue;
        const bOut = drawWrappedWithPagination(doc, page, font, `• ${bullet.trim()}`, MARGIN + BULLET_INDENT, y, bulletMaxWidth, FONT_SIZE_BODY, TEXT_DARK, LINE_HEIGHT_BODY);
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
      if (y < MARGIN + LINE_HEIGHT_BODY * 3) {
        page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
        y = PAGE_HEIGHT - MARGIN;
      }
      const title = proj.name?.trim() || 'Project';
      page.drawText(title, {
        x: MARGIN,
        y,
        size: FONT_SIZE_BODY,
        font: fontBold,
        color: TEXT_DARK,
      });
      y -= LINE_HEIGHT_BODY;
      if (proj.description?.trim()) {
        const dOut = drawWrappedWithPagination(doc, page, font, proj.description.trim(), MARGIN + BULLET_INDENT, y, bulletMaxWidth, FONT_SIZE_BODY, TEXT_DARK, LINE_HEIGHT_BODY);
        page = dOut.page;
        y = dOut.y;
      }
      for (const bullet of proj.bullets || []) {
        if (!bullet?.trim()) continue;
        const bOut = drawWrappedWithPagination(doc, page, font, `• ${bullet.trim()}`, MARGIN + BULLET_INDENT, y, bulletMaxWidth, FONT_SIZE_BODY, TEXT_DARK, LINE_HEIGHT_BODY);
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
      if (y < MARGIN + LINE_HEIGHT_BODY * 2) {
        page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
        y = PAGE_HEIGHT - MARGIN;
      }
      const line = [edu.degree, edu.institution, edu.dates].filter(Boolean).join('  |  ');
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

  // Certifications
  if (data.certifications?.length) {
    const out = drawSectionTitle(page, fontBold, 'Certifications', y, doc);
    page = out.page;
    y = out.y;
    const certText = data.certifications.map((c) => c.trim()).filter(Boolean).join('  •  ');
    if (certText) {
      const cOut = drawWrappedWithPagination(doc, page, font, certText, MARGIN, y, maxWidth, FONT_SIZE_BODY, TEXT_DARK, LINE_HEIGHT_BODY);
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
    // Section title
    const sectionTitle = section.title.replace(/:$/, '').trim();
    if (y < MARGIN + LINE_HEIGHT_SECTION + 30) {
      page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
    }
    page.drawText(sectionTitle, {
      x: MARGIN,
      y,
      size: FONT_SIZE_SECTION,
      font: fontBold,
      color: ACCENT,
    });
    y -= LINE_HEIGHT_SECTION;
    // Accent line under section title
    page.drawRectangle({
      x: MARGIN,
      y: y + 2,
      width: 36,
      height: 2,
      color: ACCENT,
    });
    y -= 6;

    // Section content (word-wrap)
    const maxWidth = CONTENT_WIDTH - 4;
    for (const line of section.lines) {
      const words = line.split(/\s+/).filter(Boolean);
      let run: string[] = [];

      for (const word of words) {
        const testRun = run.length ? [...run, word].join(' ') : word;
        const w = font.widthOfTextAtSize(testRun, FONT_SIZE_BODY);
        if (w <= maxWidth) {
          run.push(word);
        } else {
          if (run.length) {
            if (y < MARGIN + FONT_SIZE_BODY) {
              page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
              y = PAGE_HEIGHT - MARGIN;
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
            if (y < MARGIN + FONT_SIZE_BODY) {
              page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
              y = PAGE_HEIGHT - MARGIN;
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
        if (y < MARGIN + FONT_SIZE_BODY) {
          page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
          y = PAGE_HEIGHT - MARGIN;
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
