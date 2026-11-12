import { extractText, getDocumentProxy } from 'unpdf';
import { AiError } from '../errors';

export interface PdfTextOptions {
  maxBytes?: number; // default 5 MB
  maxPages?: number; // default 10
  minCharsPerPage?: number; // below this on average, the PDF is treated as scanned (default 20)
}

export interface PdfTextResult {
  text: string;
  pages: number;
}

/**
 * Reads the selectable text of a text-based PDF.
 * Throws AiError('INVALID_INPUT') with a buyer-friendly message for: not a PDF, too big, too many pages,
 * or scanned PDFs (no selectable text). The UI should then offer manual entry.
 */
export async function extractPdfText(data: Uint8Array, opts: PdfTextOptions = {}): Promise<PdfTextResult> {
  const maxBytes = opts.maxBytes ?? 5 * 1024 * 1024;
  const maxPages = opts.maxPages ?? 10;
  const minChars = opts.minCharsPerPage ?? 20;

  if (data.byteLength === 0) throw new AiError('INVALID_INPUT', 'The file is empty');
  if (data.byteLength > maxBytes) {
    throw new AiError('INVALID_INPUT', `The PDF is larger than ${Math.round(maxBytes / 1024 / 1024)} MB`);
  }
  // A real PDF starts with "%PDF-" (a few bytes of leading junk are allowed by the spec).
  const head = new TextDecoder('latin1').decode(data.subarray(0, 1024));
  if (!head.includes('%PDF-')) throw new AiError('INVALID_INPUT', 'The file is not a valid PDF');

  let pages: number;
  let raw: string;
  try {
    // Copy the bytes: the PDF library may take ownership of the buffer.
    const pdf = await getDocumentProxy(new Uint8Array(data));
    pages = pdf.numPages;
    if (pages > maxPages) throw new AiError('INVALID_INPUT', `The PDF has ${pages} pages; the limit is ${maxPages}`);
    const out = await extractText(pdf, { mergePages: true });
    raw = out.text;
  } catch (err) {
    if (err instanceof AiError) throw err;
    throw new AiError('INVALID_INPUT', 'The PDF could not be read (it may be damaged or password-protected)');
  }

  const text = raw
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (text.length < minChars * pages) {
    throw new AiError('INVALID_INPUT', 'This PDF looks scanned (no selectable text). Please enter the quotation details manually');
  }
  return { text, pages };
}
