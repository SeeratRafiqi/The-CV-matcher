import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

const MARGIN = 20;
const LINE_HEIGHT = 7;
const PAGE_WIDTH = 210; // A4
const PAGE_HEIGHT = 297;
const MAX_WIDTH = PAGE_WIDTH - MARGIN * 2;

/**
 * Build a PDF from plain text and return as a Blob.
 * Uses jsPDF - runs entirely in the browser.
 */
export function textToPdfBlob(text: string, title: string = 'Improved CV'): Blob {
  const doc = new jsPDF({ format: 'a4', unit: 'mm' });
  let y = MARGIN;

  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(title, MARGIN, y);
  y += LINE_HEIGHT * 1.5;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');

  const lines = (text || '').trim().split(/\r?\n/);
  for (const line of lines) {
    if (y > PAGE_HEIGHT - MARGIN - LINE_HEIGHT) {
      doc.addPage();
      y = MARGIN;
    }
    const wrapped = doc.splitTextToSize(line || ' ', MAX_WIDTH);
    for (const w of wrapped) {
      doc.text(w, MARGIN, y);
      y += LINE_HEIGHT;
    }
  }

  return doc.output('blob');
}

/**
 * Build a PDF from improved bullet points (when full revised text isn't available).
 */
export function improvedBulletsToPdfBlob(
  bullets: { original: string; improved: string }[],
  summary?: string
): Blob {
  const doc = new jsPDF({ format: 'a4', unit: 'mm' });
  let y = MARGIN;

  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('Improved CV – Suggested bullet points', MARGIN, y);
  y += LINE_HEIGHT * 1.5;

  if (summary) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    const summaryLines = doc.splitTextToSize(summary, MAX_WIDTH);
    for (const line of summaryLines) {
      doc.text(line, MARGIN, y);
      y += LINE_HEIGHT;
    }
    y += LINE_HEIGHT;
  }

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('Use these improved bullets in your CV:', MARGIN, y);
  y += LINE_HEIGHT * 1.2;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);

  for (let i = 0; i < bullets.length; i++) {
    if (y > PAGE_HEIGHT - MARGIN - LINE_HEIGHT * 4) {
      doc.addPage();
      y = MARGIN;
    }
    const b = bullets[i];
    doc.setFont('helvetica', 'normal');
    const improvedLines = doc.splitTextToSize(`• ${b.improved}`, MAX_WIDTH);
    for (const line of improvedLines) {
      doc.text(line, MARGIN, y);
      y += LINE_HEIGHT;
    }
    y += LINE_HEIGHT * 0.5;
  }

  return doc.output('blob');
}

export interface VoiceInterviewReportForPdf {
  jobTitle: string;
  completedAt: string | null;
  outcome: string | null;
  qa: { question: string; answer: string; answeredAt: string | null }[];
}

/**
 * Build a PDF for the voice interview report (recruiter download).
 */
export function voiceInterviewReportToPdfBlob(report: VoiceInterviewReportForPdf, candidateName?: string): Blob {
  const doc = new jsPDF({ format: 'a4', unit: 'mm' });
  let y = MARGIN;

  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('Voice Interview Report', MARGIN, y);
  y += LINE_HEIGHT * 1.2;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Role: ${report.jobTitle || '—'}`, MARGIN, y);
  y += LINE_HEIGHT;
  if (candidateName) {
    doc.text(`Candidate: ${candidateName}`, MARGIN, y);
    y += LINE_HEIGHT;
  }
  if (report.completedAt) {
    doc.text(`Completed: ${report.completedAt}`, MARGIN, y);
    y += LINE_HEIGHT;
  }
  y += LINE_HEIGHT * 0.5;

  if (report.outcome && report.outcome.trim()) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Summary & Analysis', MARGIN, y);
    y += LINE_HEIGHT * 1.2;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const outcomeLines = (report.outcome || '').trim().split(/\r?\n/);
    for (const line of outcomeLines) {
      if (y > PAGE_HEIGHT - MARGIN - LINE_HEIGHT) {
        doc.addPage();
        y = MARGIN;
      }
      const wrapped = doc.splitTextToSize(line || ' ', MAX_WIDTH);
      for (const w of wrapped) {
        doc.text(w, MARGIN, y);
        y += LINE_HEIGHT;
      }
    }
    y += LINE_HEIGHT * 0.5;
  }

  if (report.qa && report.qa.length > 0) {
    if (y > PAGE_HEIGHT - MARGIN - LINE_HEIGHT * 4) {
      doc.addPage();
      y = MARGIN;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Q&A', MARGIN, y);
    y += LINE_HEIGHT * 1.2;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    for (let i = 0; i < report.qa.length; i++) {
      const item = report.qa[i];
      if (y > PAGE_HEIGHT - MARGIN - LINE_HEIGHT * 3) {
        doc.addPage();
        y = MARGIN;
      }
      doc.setFont('helvetica', 'bold');
      const qWrapped = doc.splitTextToSize(item.question || '—', MAX_WIDTH);
      for (const w of qWrapped) {
        doc.text(w, MARGIN, y);
        y += LINE_HEIGHT;
      }
      doc.setFont('helvetica', 'normal');
      const aWrapped = doc.splitTextToSize(`A: ${item.answer || '—'}`, MAX_WIDTH);
      for (const w of aWrapped) {
        doc.text(w, MARGIN + 3, y);
        y += LINE_HEIGHT;
      }
      y += LINE_HEIGHT * 0.3;
    }
  }

  return doc.output('blob');
}

/**
 * Convert an HTML element (e.g. populated resume template) to a PDF Blob.
 * Uses html2canvas to capture the element and jsPDF to build the document.
 * Splits content across multiple A4 pages if the content is tall.
 */
export async function htmlElementToPdfBlob(element: HTMLElement): Promise<Blob> {
  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: '#ffffff',
  });
  const imgData = canvas.toDataURL('image/png');
  const doc = new jsPDF({ format: 'a4', unit: 'mm' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const imgWidth = pageWidth;
  const imgHeight = (canvas.height * pageWidth) / canvas.width;
  let heightLeft = imgHeight;
  let position = 0;
  doc.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
  heightLeft -= pageHeight;
  while (heightLeft > 0) {
    position = heightLeft - imgHeight;
    doc.addPage();
    doc.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
  }
  return doc.output('blob');
}
