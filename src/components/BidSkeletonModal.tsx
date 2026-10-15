import React, { useState } from 'react';
import { IBidResponseSkeleton } from '../lib/types/tender';
import { X, Download, Copy, Check, FileText, CheckCircle2, AlertTriangle, Printer } from 'lucide-react';

interface BidSkeletonModalProps {
  skeleton: IBidResponseSkeleton | null;
  onClose: () => void;
  isDarkMode?: boolean;
}

export const BidSkeletonModal: React.FC<BidSkeletonModalProps> = ({ 
  skeleton, 
  onClose,
  isDarkMode = false
}) => {
  const [activeSection, setActiveSection] = useState<number>(0);
  const [copied, setCopied] = useState(false);

  if (!skeleton) return null;

  const handleCopy = () => {
    const fullText = `TENDER BID RESPONSE SKELETON
Tender Reference: ${skeleton.tenderReference}
Tender Title: ${skeleton.tenderTitle}
Issuing Department: ${skeleton.issuingDepartment}
Bidder: ${skeleton.bidderProfile.companyName || 'South African SME Bidder'} (CSD: ${skeleton.bidderProfile.csdNumber || 'N/A'}, B-BBEE Level ${skeleton.bidderProfile.bbbeeLevel || 1})
Closing Date: ${skeleton.closingDate}

==================================================
${skeleton.sections.map(s => `${s.title}\n\n${s.content}`).join('\n\n==================================================\n\n')}

==================================================
PRICE SCHEDULE FRAMEWORK:
${skeleton.priceScheduleFramework.map(p => `- ${p.item} | Qty: ${p.quantity} ${p.unit} | Estimated Rate: ${p.estimatedRate} | Notes: ${p.notes}`).join('\n')}
`;
    navigator.clipboard.writeText(fullText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleDownloadDoc = () => {
    const content = `<!DOCTYPE html>
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
  <h1>Tender Bid Response Submission Skeleton</h1>
  <p><strong>Tender Reference:</strong> ${skeleton.tenderReference}</p>
  <p><strong>Title:</strong> ${skeleton.tenderTitle}</p>
  <p><strong>Issuing Organ of State:</strong> ${skeleton.issuingDepartment}</p>
  <p><strong>Bidder Entity:</strong> ${skeleton.bidderProfile.companyName} (Reg: ${skeleton.bidderProfile.registrationNumber})</p>
  <p><strong>CSD Registration:</strong> ${skeleton.bidderProfile.csdNumber} | <strong>B-BBEE Status:</strong> Level ${skeleton.bidderProfile.bbbeeLevel} (${skeleton.bidderProfile.bbbeeType})</p>
  <hr/>

  ${skeleton.sections.map(s => `<h2>${s.title}</h2><p>${s.content.replace(/\n/g, '<br/>')}</p>`).join('')}

  <h2>Commercial Price Schedule Framework (ZAR inclusive of 15% VAT)</h2>
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

  <h2>Mandatory Statutory Returnable Schedules</h2>
  <ul>
    ${skeleton.recommendedSbdForms.map(form => `<li>${form}</li>`).join('')}
  </ul>
</body>
</html>`;

    const blob = new Blob([content], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Bid_Skeleton_${skeleton.tenderReference.replace(/[^a-zA-Z0-9_-]/g, '_')}.doc`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className={`border rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden ${
        isDarkMode 
          ? 'bg-slate-900 border-slate-700/80 text-slate-100' 
          : 'bg-white border-slate-300 text-slate-800'
      }`}>
        
        {/* Header */}
        <div className={`px-6 py-4 border-b flex items-center justify-between ${
          isDarkMode ? 'border-slate-800 bg-slate-950/60' : 'border-slate-200 bg-slate-50'
        }`}>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:border dark:border-emerald-800/80 dark:text-emerald-400">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className={`font-semibold text-base ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                  Draft Bid Response Proposal Skeleton
                </h3>
                <span className="text-[10px] font-mono uppercase bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-800 px-1.5 py-0.5 rounded font-bold">
                  POPIA Protected
                </span>
              </div>
              <p className={`text-xs truncate max-w-xl ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                {skeleton.tenderReference} · {skeleton.tenderTitle}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors border ${
                isDarkMode 
                  ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700' 
                  : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300'
              }`}
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied Full Draft' : 'Copy Text'}</span>
            </button>

            <button
              onClick={handleDownloadDoc}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white rounded-md transition-colors shadow-2xs"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download Word (.doc)</span>
            </button>

            <button
              onClick={onClose}
              className={`p-1.5 rounded-md transition-colors ${
                isDarkMode ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Section Tabs */}
        <div className={`px-6 py-2.5 border-b flex items-center gap-2 overflow-x-auto text-xs ${
          isDarkMode ? 'bg-slate-950/40 border-slate-800' : 'bg-slate-100/60 border-slate-200'
        }`}>
          {skeleton.sections.map((sec, idx) => (
            <button
              key={idx}
              onClick={() => setActiveSection(idx)}
              className={`px-3 py-1.5 rounded-md transition-colors whitespace-nowrap border ${
                activeSection === idx
                  ? isDarkMode
                    ? 'bg-slate-800 text-emerald-400 font-medium border-slate-700'
                    : 'bg-white text-emerald-800 font-semibold border-emerald-300 shadow-2xs'
                  : isDarkMode
                    ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-900 border-transparent'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 border-transparent'
              }`}
            >
              Section {idx + 1}: {sec.title.split(':')[1]?.trim() || sec.title}
            </button>
          ))}
          <button
            onClick={() => setActiveSection(99)}
            className={`px-3 py-1.5 rounded-md transition-colors whitespace-nowrap border ${
              activeSection === 99
                ? isDarkMode
                  ? 'bg-slate-800 text-emerald-400 font-medium border-slate-700'
                  : 'bg-white text-emerald-800 font-semibold border-emerald-300 shadow-2xs'
                : isDarkMode
                  ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-900 border-transparent'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 border-transparent'
            }`}
          >
            Commercial Pricing Table
          </button>
        </div>

        {/* Body Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-sm font-sans leading-relaxed">
          {activeSection !== 99 ? (
            <div className="space-y-4">
              <div className={`p-3.5 rounded-lg border ${
                isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
              }`}>
                <h4 className={`font-semibold text-base mb-1 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                  {skeleton.sections[activeSection]?.title}
                </h4>
                <p className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  {skeleton.sections[activeSection]?.description}
                </p>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-lg p-5 font-mono text-xs whitespace-pre-wrap text-slate-200">
                {skeleton.sections[activeSection]?.content}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className={`p-3.5 rounded-lg border ${
                isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
              }`}>
                <h4 className={`font-semibold text-base mb-1 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                  Section 3.3: Itemized Commercial Price Schedule Framework
                </h4>
                <p className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  Standardized cost breakdown formulated for South African public procurement compliance (15% VAT inclusive).
                </p>
              </div>

              <div className={`overflow-x-auto rounded-lg border ${isDarkMode ? 'border-slate-800' : 'border-slate-200'}`}>
                <table className="w-full text-left text-xs">
                  <thead className={`border-b ${
                    isDarkMode ? 'bg-slate-950 text-slate-400 border-slate-800' : 'bg-slate-100 text-slate-600 border-slate-200'
                  }`}>
                    <tr>
                      <th className="py-2.5 px-3">Scope Description</th>
                      <th className="py-2.5 px-3">Unit</th>
                      <th className="py-2.5 px-3">Quantity</th>
                      <th className="py-2.5 px-3">Estimated Rate (ZAR)</th>
                      <th className="py-2.5 px-3">Procurement Notes</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${
                    isDarkMode ? 'divide-slate-800/60 bg-slate-900/60 text-slate-300' : 'divide-slate-200 bg-white text-slate-700'
                  }`}>
                    {skeleton.priceScheduleFramework.map((row, idx) => (
                      <tr key={idx} className={isDarkMode ? 'hover:bg-slate-850' : 'hover:bg-slate-50'}>
                        <td className={`py-2.5 px-3 font-medium ${isDarkMode ? 'text-slate-200' : 'text-slate-900'}`}>{row.item}</td>
                        <td className={`py-2.5 px-3 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>{row.unit}</td>
                        <td className="py-2.5 px-3">{row.quantity}</td>
                        <td className="py-2.5 px-3 font-semibold text-emerald-600">{row.estimatedRate}</td>
                        <td className={`py-2.5 px-3 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>{row.notes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Compliance Matrix on active tender */}
          <div className={`mt-6 pt-5 border-t ${isDarkMode ? 'border-slate-800' : 'border-slate-200'}`}>
            <h5 className={`text-xs font-semibold uppercase tracking-wider mb-3 ${
              isDarkMode ? 'text-slate-400' : 'text-slate-500'
            }`}>
              Bidder Compliance Verification Check (Against {skeleton.bidderProfile.companyName})
            </h5>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {skeleton.complianceChecklist.map((c, i) => (
                <div key={i} className={`flex items-start gap-2.5 p-2.5 rounded-lg border text-xs ${
                  isDarkMode ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'
                }`}>
                  {c.compliant ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <div className={`font-medium ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>{c.item}</div>
                    <div className={`text-[11px] ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                      {c.smeStatus} · <span className={isDarkMode ? 'text-slate-500' : 'text-slate-400'}>{c.referenceDocument}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className={`px-6 py-3 border-t flex items-center justify-between text-xs ${
          isDarkMode ? 'border-slate-800 bg-slate-950/80 text-slate-400' : 'border-slate-200 bg-slate-50 text-slate-500'
        }`}>
          <div>
            Formatted strictly under South African PPPFA & SBD Returnables Guidelines.
          </div>
          <button
            onClick={onClose}
            className={`px-3 py-1.5 rounded-md transition-colors border ${
              isDarkMode 
                ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700' 
                : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300'
            }`}
          >
            Close Viewer
          </button>
        </div>

      </div>
    </div>
  );
};
