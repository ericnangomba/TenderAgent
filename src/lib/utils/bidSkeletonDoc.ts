import { IBidResponseSkeleton } from '../types/tender';
const escapeHtml = (v: string) => v.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
function encode(v: any): any {
  if (typeof v === 'string') return escapeHtml(v);
  if (Array.isArray(v)) return v.map(encode);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, encode(x)]));
  return v;
}
export function buildBidSkeletonDoc(source: IBidResponseSkeleton): string {
  const skeleton: IBidResponseSkeleton = encode(source);
  const humanDate = (v: string) => { const t = Date.parse(v); return Number.isNaN(t) ? (v || 'Confirm in the tender document') : new Date(t).toLocaleDateString('en-ZA', {day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}); };
  return `<!DOCTYPE html>
<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head>
  <meta charset="utf-8">
  <title>${skeleton.tenderReference} - Bid Response</title>
  <style>
    body { font-family: 'Calibri', 'Segoe UI', Arial, sans-serif; line-height: 1.5; color: #1e293b; padding: 20px; }
    h1 { color: #047857; font-size: 20pt; border-bottom: 2pt solid #047857; padding-bottom: 6pt; }
    h2 { color: #0f172a; font-size: 14pt; margin-top: 18pt; }
    p { font-size: 11pt; white-space: pre-wrap; }
    table { width: 100%; border-collapse: collapse; margin-top: 12pt; }
    th { background-color: #047857; color: white; border: 1pt solid #cbd5e1; padding: 8pt; text-align: left; }
    td { border: 1pt solid #cbd5e1; padding: 8pt; font-size: 10pt; }
    .badge { font-weight: bold; color: #047857; }
  </style>
</head>
<body>
  <h1>Draft Bid Response Framework</h1><p><strong>Not ready for submission.</strong> Use the original tender and its official forms. Verify every field, claim and requirement.</p>
  <p><strong>Tender Reference:</strong> ${skeleton.tenderReference}</p>
  <p><strong>Title:</strong> ${skeleton.tenderTitle}</p>
  <p><strong>Issuing Organ of State:</strong> ${skeleton.issuingDepartment}</p>
  <p><strong>Declared bidder entity (not verified):</strong> ${skeleton.bidderProfile.companyName || '[Bidder company name]'}${skeleton.bidderProfile.registrationNumber ? ` (Reg: ${skeleton.bidderProfile.registrationNumber})` : ''}</p>
  <p>${[
    skeleton.bidderProfile.csdNumber ? `<strong>Declared CSD (not verified):</strong> ${skeleton.bidderProfile.csdNumber}` : '<strong>Declared CSD (not verified):</strong> [MAAA supplier number]',
    skeleton.bidderProfile.bbbeeLevel ? `<strong>Declared B-BBEE (not verified):</strong> Level ${skeleton.bidderProfile.bbbeeLevel} (${skeleton.bidderProfile.bbbeeType})` : '<strong>Declared B-BBEE (not verified):</strong> [level per certificate or affidavit]',
  ].join(' | ')}</p>
  <p><strong>Closing Date:</strong> ${humanDate(skeleton.closingDate)}</p>
  <hr/>

  ${skeleton.sections.map(s => `<h2>${s.title}</h2><p>${s.content.replace(/\n/g, '<br/>')}</p>`).join('')}

  <h2>Commercial Price Schedule Framework (state whether prices include or exclude VAT as this tender requires)</h2>
  <table>
    <thead>
      <tr>
        <th>Deliverable Item</th>
        <th>Unit</th>
        <th>Qty</th>
        <th>Rate (ZAR)</th>
        <th>Scope Specifications</th>
      </tr>
    </thead>
    <tbody>
      ${skeleton.priceScheduleFramework.map(p => `
        <tr>
          <td>${p.item}</td>
          <td>${p.unit}</td>
          <td>${p.quantity}</td>
          <td><strong>${p.estimatedRate}</strong></td>
          <td>${p.notes}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <h2>Returnable Schedules (confirm against this tender's list)</h2>
  <ul>
    ${skeleton.recommendedSbdForms.map(form => `<li>${form}</li>`).join('')}
  </ul>
</body>
</html>`;

}

/** Plain-text copy carries the same limitations as the document export. */
export function buildBidSkeletonText(skeleton: IBidResponseSkeleton): string {
  const profile = skeleton.bidderProfile;
  return `DRAFT FRAMEWORK - NOT READY FOR SUBMISSION
Not an official bidding form, legal advice or proof of compliance. Use the original tender and its official forms. Verify every field, claim and requirement.
Tender Reference: ${skeleton.tenderReference}
Tender Title: ${skeleton.tenderTitle}
Issuing Department: ${skeleton.issuingDepartment}
Declared bidder details - not verified:
Company: ${profile.companyName || '[Bidder company name]'}
CSD (declared, not verified): ${profile.csdNumber || '[MAAA supplier number, if required]'}
B-BBEE (declared, not verified): ${profile.bbbeeLevel ? `Level ${profile.bbbeeLevel} (${profile.bbbeeType || 'type not provided'})` : '[level per certificate or affidavit, if required]'}
Closing Date (confirm in original tender): ${skeleton.closingDate || '[Confirm in the tender document]'}

${skeleton.sections.map(s => `${s.title}\n\n${s.content}`).join('\n\n==================================================\n\n')}

PRICE SCHEDULE PROMPTS - USE THE TENDER'S OFFICIAL SCHEDULE:
${skeleton.priceScheduleFramework.map(p => `- ${p.item} | Qty: ${p.quantity} ${p.unit} | Rate: ${p.estimatedRate} | Notes: ${p.notes}`).join('\n')}
`;
}
