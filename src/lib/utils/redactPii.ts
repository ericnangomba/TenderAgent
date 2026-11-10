/**
 * Redaction applied before ANY AI processing and before the in-memory
 * analysis excerpt is taken. Coverage: SA ID / card-like digit runs, email
 * addresses, SA phone numbers (contiguous, space-separated or +27 form) and SA
 * VAT numbers. Dash-separated local phone forms are deliberately NOT matched:
 * tender references look the same and must survive.
 * Names, physical addresses and other personal details still pass through -
 * /api/health's privacyNote states that limit plainly.
 */
export function redactPii(text: string): string {
  return text
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[CONFIDENTIAL_POPIA_REDACTED]')
    .replace(/\+27[ -]?\d{2}[ -]?\d{3}[ -]?\d{4}|\b0\d{9}\b|\b0\d{2} \d{3} \d{4}\b/g, '[CONFIDENTIAL_POPIA_REDACTED]')
    .replace(/\b4\d{9}\b/g, '[CONFIDENTIAL_POPIA_REDACTED]')
    .replace(/\b(?:\d[ -]*?){13,16}\b/g, '[CONFIDENTIAL_POPIA_REDACTED]');
}
