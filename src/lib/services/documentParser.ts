import { PDFParse } from 'pdf-parse';

export interface IParsedDocumentResult {
  success: boolean;
  text: string;
  pageCount: number;
  titleGuess?: string;
  referenceGuess?: string;
  issuingDeptGuess?: string;
  closingDateGuess?: string;
  error?: string;
}

/**
 * Extracts clean, human-readable text from a PDF Buffer or Uint8Array
 */
export async function extractTextFromPdf(data: Buffer | Uint8Array): Promise<IParsedDocumentResult> {
  try {
    const uint8 = data instanceof Uint8Array ? data : new Uint8Array(data);
    const parser = new PDFParse({ data: uint8 });
    const result: any = await parser.getText();
    
    let rawText = '';
    let pageCount = 1;

    if (typeof result === 'string') {
      rawText = result;
    } else if (result && typeof result.text === 'string') {
      rawText = result.text;
      pageCount = result.total || result.pages?.length || 1;
    } else if (result && Array.isArray(result.pages)) {
      rawText = result.pages.map((p: any) => p.text || '').join('\n\n');
      pageCount = result.pages.length;
    }

    // Clean up excessive whitespace and PDF artifact control characters
    const cleanText = rawText
      .replace(/\r\n/g, '\n')
      .replace(/\u0000/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    // Extract common South African tender patterns
    const refMatch = cleanText.match(/(?:TENDER|BID|REF|RFP|RFQ|CONTRACT)[\s.:#№\/-]*([A-Z0-9\/\-_.]{3,35})/i)
      || cleanText.match(/\b([A-Z]{2,6}[\s\/-]?\d{1,5}[\/-]\d{2,4}(?:-[A-Z0-9]+)?)\b/);
    
    const deptMatch = cleanText.match(/(?:ISSUING AUTHORITY|ORGAN OF STATE|DEPARTMENT|MUNICIPALITY|ENTITY|AGENCY)[:\s]+([^\n\r]{4,80})/i)
      || cleanText.match(/\b(Small Enterprise Development Agency|SEDA|National Treasury|SANRAL|City of Cape Town|Drakenstein Municipality|Western Cape Government|PRASA|Eskom)\b/i);

    const dateMatch = cleanText.match(/(?:CLOSING DATE|DEADLINE|CLOSES)[:\s]+([0-9]{1,2}[\s\/\-][A-Za-z0-9]+[\s\/\-][0-9]{2,4})/i)
      || cleanText.match(/([0-9]{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+202[4-9])/i);

    const titleCandidate = cleanText
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 15 && !line.startsWith('%') && !line.includes('Page ') && !line.includes('www.'))[0] || 'South African Public Sector RFP Document';

    return {
      success: true,
      text: cleanText,
      pageCount,
      referenceGuess: refMatch ? refMatch[1].trim() : undefined,
      issuingDeptGuess: deptMatch ? (deptMatch[1] || deptMatch[0]).trim() : undefined,
      closingDateGuess: dateMatch ? dateMatch[1].trim() : undefined,
      titleGuess: titleCandidate.slice(0, 120)
    };
  } catch (err: any) {
    console.error('[DocumentParser] PDF parsing error:', err);
    return {
      success: false,
      text: '',
      pageCount: 0,
      error: err.message || 'Failed to extract text from PDF file'
    };
  }
}

/**
 * Checks if a string contains raw PDF binary stream signatures (%PDF-1.x)
 */
export function isRawPdfString(input: string): boolean {
  if (!input || typeof input !== 'string') return false;
  const trimmed = input.trim();
  return trimmed.startsWith('%PDF-') || (trimmed.includes('%PDF-') && trimmed.includes('endobj'));
}

/**
 * Recovers text from a raw PDF binary string by converting string bytes to Buffer
 */
export async function parseRawPdfString(pdfString: string): Promise<IParsedDocumentResult> {
  try {
    // Convert raw binary characters to binary Buffer
    const buffer = Buffer.from(pdfString, 'binary');
    return await extractTextFromPdf(buffer);
  } catch (err: any) {
    console.error('[DocumentParser] Raw PDF string conversion error:', err);
    return {
      success: false,
      text: '',
      pageCount: 0,
      error: 'Could not decode raw PDF stream'
    };
  }
}
