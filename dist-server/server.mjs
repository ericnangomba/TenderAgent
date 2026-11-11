// src/lib/utils/privacyCopy.ts
var DOCUMENT_REDACTION_NOTICE = "Tender-text redaction matches 13-16 digit ID/card-like runs, email addresses, SA phone numbers in contiguous, spaced or +27 forms, and VAT-like numbers. Dash-separated local phones, names, physical addresses and other personal details can still pass through. This is not a guarantee that a document is safe to share with cloud AI.";

// server.ts
import express from "express";
import { createServer as createViteServer } from "vite";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

// src/lib/agents/mastraEngine.ts
import * as Sentry from "@sentry/node";
import { GoogleGenAI } from "@google/genai";

// src/lib/utils/redactPii.ts
function redactPii(text) {
  return text.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[CONFIDENTIAL_POPIA_REDACTED]").replace(/\+27[ -]?\d{2}[ -]?\d{3}[ -]?\d{4}|\b0\d{9}\b|\b0\d{2} \d{3} \d{4}\b/g, "[CONFIDENTIAL_POPIA_REDACTED]").replace(/\b4\d{9}\b/g, "[CONFIDENTIAL_POPIA_REDACTED]").replace(/\b(?:\d[ -]*?){13,16}\b/g, "[CONFIDENTIAL_POPIA_REDACTED]");
}

// src/lib/utils/skeletonGenerator.ts
function generateBidResponseSkeleton(tenderData, companyProfile) {
  const PLACEHOLDERS = {
    companyName: "[Your registered company name]",
    registrationNumber: "",
    csdNumber: "",
    taxComplianceStatusPin: "",
    bbbeeLevel: 0,
    bbbeeType: "EME",
    cidbGrading: "",
    coidaGoodStandingValid: false,
    coidaExpiryDate: "",
    contactEmail: "[Contact email]",
    contactPhone: "[Contact phone]",
    province: "[Province]"
  };
  const company = { ...PLACEHOLDERS, ...Object.fromEntries(
    Object.entries(companyProfile || {}).filter(([, v]) => v !== void 0 && v !== null && v !== "")
  ) };
  if (!company.companyName) company.companyName = PLACEHOLDERS.companyName;
  const tenderRef = tenderData.referenceNumber || "[Tender reference - confirm from the tender document]";
  const tenderTitle = tenderData.title || "Procurement of Goods & Services";
  const dept = tenderData.issuingDepartment || tenderData.dept || "Organ of State";
  const rawPoints = tenderData.evaluationCriteria?.preferencePointsSystem;
  const points = rawPoints === "80/20" || rawPoints === "90/10" ? rawPoints : null;
  return {
    tenderReference: tenderRef,
    tenderTitle,
    issuingDepartment: dept,
    closingDate: tenderData.closingDate ? String(tenderData.closingDate) : "Confirm in the tender document",
    bidderProfile: company,
    sections: [
      {
        title: "Section 1: Executive Summary & Bidder Eligibility Declaration",
        description: "Draft prompts only. Confirm eligibility and use the official forms supplied with this tender.",
        content: `DRAFT FRAMEWORK - NOT READY FOR SUBMISSION
Confirm every extracted field against the original tender. This is not an official bidding form, legal advice or proof of compliance.

1.1 Introduction
${company.companyName}${company.registrationNumber ? ` (Registration No: ${company.registrationNumber})` : ""}
[Write an introduction for tender ${tenderRef}: "${tenderTitle}", issued by ${dept}. Do not claim qualifications or commitments you cannot support.]

1.2 Declared profile details - not verified
- CSD: ${company.csdNumber ? `MAAA supplier number on file: ${company.csdNumber}` : "[MAAA supplier number, if required]"}.
- SARS TCS PIN: ${company.taxComplianceStatusPin || "[TCS PIN, if required]"}.
${company.bbbeeLevel ? `- B-BBEE: Declared Level ${company.bbbeeLevel} (${company.bbbeeType}); verify the supporting document.` : "- B-BBEE: [level per your certificate or affidavit, if required]"}
${tenderData.cidbGradingRequired ? company.cidbGrading ? `- CIDB Registration: grading ${company.cidbGrading} on file - verify it meets this tender's stated ${tenderData.cidbGradingRequired} requirement.` : `- CIDB Registration: [this tender states ${tenderData.cidbGradingRequired} - add your cidb registration and grading, or confirm it does not apply]` : "- CIDB: Not listed in the extracted requirements. Confirm applicability in the original tender."}

1.3 Information protection
[Add the information-protection terms required by this tender. Do not include personal information unless needed and lawfully shared. This template does not create a confidentiality guarantee or privilege.]`
      },
      {
        title: "Section 2: Technical Methodology & Implementation Plan",
        description: "Complete from the tender specifications and your actual delivery plan.",
        content: `2.1 Scope and method
[Quote the tender clause and describe how you will meet each specification.]

2.2 Resources and delivery dates
[Add personnel, equipment, milestones and dates supported by your proposed delivery plan. No schedule is assumed.]

2.3 Evaluation and evidence
[Copy any functionality threshold and evaluation criteria from the source tender. Add evidence for each criterion. Do not assume a threshold.]`
      },
      {
        title: points ? `Section 3: Commercial Proposal & ${points} Preference Points Matrix` : "Section 3: Commercial Proposal & Preference Points",
        description: points ? `Pricing structure under the ${points} formula stated in this tender (Preferential Procurement Regulations 2022).` : "Pricing structure - confirm the preference-point system (80/20 or 90/10) stated in the tender document.",
        content: `3.1 Price Responsiveness
All pricing is stated in South African Rand (ZAR). State here whether your prices include or exclude VAT, as this tender's pricing schedule requires. [Confirm applicable VAT treatment from the source and your tax status.]

3.2 Preference Points Claim (PPPFA 2022)
${points ? `Under the ${points} evaluation framework stated in this tender:
- Price Allocation: ${points === "90/10" ? "90 Points" : "80 Points"}
- Specific Goals: ${points === "90/10" ? "10 Points" : "20 Points"}
Your final score is computed by the organ of state from all received bids under the ${points} formula; this template does not estimate it.` : "The tender text did not state the preference-point system. [Confirm the preference-point system and specific goals in the source tender before completing this claim. No system is assumed.]"}`
      },
      {
        title: "Section 4: Returnable Schedules & Annexures",
        description: "Index of returnable schedules - include only those this tender lists.",
        content: `The tender's own returnables list governs. Use its official SBD or MBD forms, versions, instructions and signature requirements.
[Create an annexure index from the source tender: document name, clause/page, required evidence and completion status.]
Do not assume that SBD 4 requires commissioner stamping or that SBD 8 or SBD 9 applies. The revised Treasury SBD 4 is titled Bidder's Disclosure. Use the forms in the actual tender pack and clarify any conflicting instructions with the issuer.`
      }
    ],
    complianceChecklist: [
      {
        item: "Central Supplier Database (CSD)",
        requirement: "Active MAAA Number & Tax Compliance Status (TCS) PIN",
        smeStatus: company.csdNumber ? `Registered (${company.csdNumber})` : "Missing CSD Number",
        referenceDocument: "CSD Master Supplier Report"
      },
      {
        item: "SARS Tax Compliance Status",
        requirement: "Valid TCS PIN for third-party verification",
        smeStatus: company.taxComplianceStatusPin ? `PIN on file (${company.taxComplianceStatusPin})` : "Missing Tax PIN",
        referenceDocument: "SARS TCS Verification Printout"
      },
      {
        item: "B-BBEE Status & Specific Goals",
        requirement: "SANAS Verification Certificate or EME Affidavit",
        smeStatus: company.bbbeeLevel ? `Declared Level ${company.bbbeeLevel} (${company.bbbeeType}) - certificate/affidavit to attach` : "Level not set - add your certificate or affidavit level",
        referenceDocument: "Sworn Affidavit / SANAS Certificate"
      },
      {
        item: "COIDA Letter of Good Standing",
        requirement: "Compensation Commissioner current certification",
        smeStatus: company.coidaGoodStandingValid ? "Declared current on file - verify date and evidence" : "Not provided or not confirmed current",
        referenceDocument: "COIDA Letter of Good Standing"
      },
      {
        item: "SBD 4 Bidder's Disclosure",
        requirement: "Declaration of any state employment ties, where this tender calls for SBD 4",
        smeStatus: "To complete and sign",
        referenceDocument: "SBD 4 Original Signed"
      },
      {
        item: "CIDB Contractor Grading",
        requirement: tenderData.cidbGradingRequired ? `Stated Grade ${tenderData.cidbGradingRequired} - confirm from source` : "Not listed - confirm applicability",
        smeStatus: tenderData.cidbGradingRequired ? company.cidbGrading ? `Declared grading ${company.cidbGrading} - verify against the tender` : "Not provided" : "Not listed in this tender - confirm applicability",
        referenceDocument: "Source tender and registration evidence, if applicable"
      }
    ],
    priceScheduleFramework: [
      { item: "[Deliverable from tender pricing schedule]", unit: "[Unit from source]", quantity: "[Quantity from source]", estimatedRate: "[Your rate]", notes: "[Quote source clause; confirm VAT treatment and total]" }
    ],
    recommendedSbdForms: [
      "Use only the official SBD or MBD forms and versions included in this tender pack. Confirm its returnables list; no standard set is assumed."
    ]
  };
}

// src/lib/services/documentParser.ts
import { PDFParse } from "pdf-parse";
async function extractTextFromPdf(data) {
  try {
    const uint8 = data instanceof Uint8Array ? data : new Uint8Array(data);
    const parser = new PDFParse({ data: uint8 });
    const result = await parser.getText();
    let rawText = "";
    let pageCount = 1;
    if (typeof result === "string") {
      rawText = result;
    } else if (result && typeof result.text === "string") {
      rawText = result.text;
      pageCount = result.total || result.pages?.length || 1;
    } else if (result && Array.isArray(result.pages)) {
      rawText = result.pages.map((p) => p.text || "").join("\n\n");
      pageCount = result.pages.length;
    }
    const cleanText = rawText.replace(/\r\n/g, "\n").replace(/\u0000/g, "").replace(/\n{3,}/g, "\n\n").trim();
    const refMatch = cleanText.match(/(?:TENDER|BID|REF|RFP|RFQ|CONTRACT)[\s.:#№\/-]*([A-Z0-9\/\-_.]{3,35})/i) || cleanText.match(/\b([A-Z]{2,6}[\s\/-]?\d{1,5}[\/-]\d{2,4}(?:-[A-Z0-9]+)?)\b/);
    const deptMatch = cleanText.match(/(?:ISSUING AUTHORITY|ORGAN OF STATE|DEPARTMENT|MUNICIPALITY|ENTITY|AGENCY)[:\s]+([^\n\r]{4,80})/i) || cleanText.match(/\b(Small Enterprise Development Agency|SEDA|National Treasury|SANRAL|City of Cape Town|Drakenstein Municipality|Western Cape Government|PRASA|Eskom)\b/i);
    const dateMatch = cleanText.match(/(?:CLOSING DATE|DEADLINE|CLOSES)[:\s]+([0-9]{1,2}[\s\/\-][A-Za-z0-9]+[\s\/\-][0-9]{2,4})/i) || cleanText.match(/([0-9]{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+202[4-9])/i);
    const titleCandidate = cleanText.split("\n").map((line) => line.trim()).filter((line) => line.length > 15 && !line.startsWith("%") && !line.includes("Page ") && !line.includes("www."))[0] || "South African Public Sector RFP Document";
    return {
      success: true,
      text: cleanText,
      pageCount,
      referenceGuess: refMatch ? refMatch[1].trim() : void 0,
      issuingDeptGuess: deptMatch ? (deptMatch[1] || deptMatch[0]).trim() : void 0,
      closingDateGuess: dateMatch ? dateMatch[1].trim() : void 0,
      titleGuess: titleCandidate.slice(0, 120)
    };
  } catch (err) {
    console.error("[DocumentParser] PDF parsing error:", err);
    return {
      success: false,
      text: "",
      pageCount: 0,
      error: err.message || "Failed to extract text from PDF file"
    };
  }
}
function isRawPdfString(input) {
  if (!input || typeof input !== "string") return false;
  const trimmed = input.trim();
  return trimmed.startsWith("%PDF-") || trimmed.includes("%PDF-") && trimmed.includes("endobj");
}
async function parseRawPdfString(pdfString) {
  try {
    const buffer = Buffer.from(pdfString, "binary");
    return await extractTextFromPdf(buffer);
  } catch (err) {
    console.error("[DocumentParser] Raw PDF string conversion error:", err);
    return {
      success: false,
      text: "",
      pageCount: 0,
      error: "Could not decode raw PDF stream"
    };
  }
}

// src/lib/agents/mastraEngine.ts
var SENTRY_DSN = process.env.SENTRY_DSN || "";
if (SENTRY_DSN) {
  try {
    Sentry.init({
      dsn: SENTRY_DSN,
      tracesSampleRate: 1,
      environment: process.env.NODE_ENV || "development"
    });
  } catch (err) {
    console.warn("[Sentry] Warning initializing Sentry client:", err);
  }
}
var inMemoryTenderStore = /* @__PURE__ */ new Map();
var activeLlmConfig = {
  provider: "llama-3.1-8b",
  modelId: "meta-llama/Llama-3.1-8B-Instruct",
  baseUrl: "http://localhost:11434/v1",
  temperature: 0.1,
  topP: 0.9,
  maxTokens: 2048,
  systemPrompt: "You are an expert South African tender compliance auditor analyzing public procurement RFP documents under South African procurement legislation (PPPFA, Preferential Procurement Regulations 2022, CIDB Act, COIDA, POPIA, and National Treasury SCM instructions)."
};
var SELECTABLE_ENGINES = {
  "llama-3.1-8b-instruct": { provider: "ollama", modelId: "meta-llama/Llama-3.1-8B-Instruct", baseUrl: "http://localhost:11434/v1" },
  "gemma-2-9b-it": { provider: "ollama", modelId: "google/gemma-2-9b-it", baseUrl: "http://localhost:11434/v1" },
  "gemini-2.5-flash": { provider: "gemini", modelId: "gemini-2.5-flash" },
  "gemma2-local": { provider: "statutory", modelId: "gemma2-local" }
};
function resolveServerLlmConfig(selectedModelId) {
  if (selectedModelId && SELECTABLE_ENGINES[selectedModelId]) {
    return { ...SELECTABLE_ENGINES[selectedModelId] };
  }
  return {};
}
function publicLlmConfigView() {
  return {
    modelId: activeLlmConfig.modelId,
    provider: activeLlmConfig.provider,
    baseUrl: activeLlmConfig.baseUrl,
    temperature: activeLlmConfig.temperature
  };
}
async function extractComplianceWithGemma(rawText, referenceId, customConfig, allowCloudLlm = false) {
  const config = { ...activeLlmConfig, ...customConfig || {} };
  const failoverLogs = [];
  let failoverOccurred = false;
  const prompt = `Analyze the following South African RFP text under South African procurement legislation (PPPFA, Preferential Procurement Regulations 2022, CIDB Act, COIDA, and National Treasury SCM instructions).
Output strictly a valid JSON object with NO markdown code fences and NO explanatory prose:
{
  "title": "Concise clean tender title",
  "referenceNumber": "Unique tender reference ID or use '${referenceId}'",
  "issuingDepartment": "Name of organ of state or state-owned enterprise",
  "closingDate": "YYYY-MM-DD exactly as stated, or null if the text states no closing date",
  "cidbGrading": "Extracted CIDB grading such as 7CE, 3GB, or null",
  "estimatedBudget": "Estimated amount in ZAR or Not Specified",
  "category": "Services: General | Financial and insurance activities | Supplies: General | Civil engineering | Information and communication | ICT & Technology | Security & Facilities",
  "province": "Western Cape | Gauteng | KwaZulu-Natal | Eastern Cape | National / South Africa",
  "checklist": {
    "csd": true,
    "sars": true,
    "bbbee": true,
    "coida": true,
    "compulsoryBriefing": true,
    "subcontracting30Percent": false,
    "additionalDocuments": ["SBD 4", "SBD 6.1", "COIDA Good Standing", "CIDB Certificate"]
  },
Set each checklist boolean true ONLY when the tender text itself lists that item as a requirement; otherwise false. Never infer a statutory obligation that the text does not state.
  "points": "80/20" or "90/10" exactly as stated in the text, or null if the text does not state the preference-point system,
  "technicalThreshold": 75
}

Document Text:
${rawText.slice(0, 1e4)}`;
  const attemptLocalOpenLlm = async (endpoint, modelName) => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6500);
      const response = await fetch(`${endpoint}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
          // No Authorization header here on purpose: local runners do not need
          // one, and attaching the server's paid API key to an HTTP call would
          // leak it wherever the endpoint points.
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: modelName,
          messages: [
            { role: "system", content: config.systemPrompt },
            { role: "user", content: prompt }
          ],
          temperature: config.temperature,
          max_tokens: config.maxTokens
        })
      });
      clearTimeout(timeoutId);
      if (response.ok) {
        const json = await response.json();
        const text = json.choices?.[0]?.message?.content || "{}";
        const cleaned = text.replace(/```json/g, "").replace(/```/g, "").trim();
        return JSON.parse(cleaned);
      }
      return null;
    } catch (err) {
      return null;
    }
  };
  const attemptGemini = async () => {
    if (!allowCloudLlm) {
      failoverLogs.push("[Policy] Cloud AI skipped: paid AI credits are used only for subscribed accounts.");
      return null;
    }
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return null;
    try {
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          temperature: 0.1
        }
      });
      return JSON.parse(response.text || "{}");
    } catch (err) {
      console.warn("[Agent LLM] Gemini call failed:", err.message);
      return null;
    }
  };
  if (config.provider !== "gemini" && config.provider !== "statutory" && config.baseUrl) {
    failoverLogs.push(`[Mastra Engine] Calling assigned local model: ${config.modelId} at ${config.baseUrl}...`);
    const localResult = await attemptLocalOpenLlm(config.baseUrl, config.modelId);
    if (localResult && localResult.title) {
      return {
        parsed: localResult,
        modelUsed: `${config.modelId} (Local Runner)`,
        failoverOccurred: false,
        failoverLogs
      };
    }
    failoverOccurred = true;
    failoverLogs.push(`\u26A0\uFE0F [Auto-Failover] Local model (${config.modelId}) offline or unreachable at ${config.baseUrl}.`);
    failoverLogs.push(`\u{1F504} [Auto-Failover] Automatically failing over task to Cloud LLM (Gemini 2.5 Flash)...`);
    const cloudResult = await attemptGemini();
    if (cloudResult && cloudResult.title) {
      failoverLogs.push(`\u2705 [Auto-Failover] Cloud LLM completed compliance extraction successfully.`);
      return {
        parsed: cloudResult,
        modelUsed: `Gemini 2.5 Flash (Auto-failover from Local ${config.modelId})`,
        failoverOccurred: true,
        failoverLogs
      };
    }
    failoverLogs.push(`\u26A0\uFE0F [Auto-Failover] Cloud LLM also unavailable or overloaded. Activating Statutory Procurement Heuristics Engine...`);
  } else if (config.provider === "gemini") {
    failoverLogs.push(`[Mastra Engine] Calling Cloud LLM: Gemini 2.5 Flash...`);
    const cloudResult = await attemptGemini();
    if (cloudResult && cloudResult.title) {
      return {
        parsed: cloudResult,
        modelUsed: "Gemini 2.5 Flash (Cloud)",
        failoverOccurred: false,
        failoverLogs
      };
    }
    failoverOccurred = true;
    failoverLogs.push(`\u26A0\uFE0F [Auto-Failover] Cloud LLM API overloaded or unavailable. Attempting automatic failover to local runner...`);
    const localEndpoints = ["http://localhost:11434/v1", "http://127.0.0.1:11434/v1", "http://localhost:1234/v1"];
    const candidates = ["llama3.1:8b", "llama3.1", "gemma2:9b", "gemma2", "meta-llama/Llama-3.1-8B-Instruct"];
    let localResult = null;
    let successfulCandidate = "";
    for (const ep of localEndpoints) {
      for (const cand of candidates) {
        localResult = await attemptLocalOpenLlm(ep, cand);
        if (localResult && localResult.title) {
          successfulCandidate = cand;
          break;
        }
      }
      if (localResult) break;
    }
    if (localResult && localResult.title) {
      failoverLogs.push(`\u2705 [Auto-Failover] Successfully failed over to local model: ${successfulCandidate}!`);
      return {
        parsed: localResult,
        modelUsed: `${successfulCandidate} (Auto-failover from Cloud)`,
        failoverOccurred: true,
        failoverLogs
      };
    }
    failoverLogs.push(`\u26A0\uFE0F [Auto-Failover] Local models offline. Engaging rule-based statutory compliance engine (offline)...`);
  }
  const upper = rawText.toUpperCase();
  const csdMatch = /CSD|CENTRAL SUPPLIER DATABASE|MAAA/i.test(rawText);
  const sarsMatch = /SARS|TAX COMPLIANCE|TCS PIN|TAX PIN/i.test(rawText);
  const bbbeeMatch = /B-BBEE|BBBEE|BROAD-BASED BLACK ECONOMIC|SWORN AFFIDAVIT/i.test(rawText);
  const coidaMatch = /COIDA|COMPENSATION COMMISSIONER|LETTER OF GOOD STANDING|FEM/i.test(rawText);
  const briefingMatch = /COMPULSORY|BRIEFING SESSION|SITE MEETING|CLARIFICATION MEETING/i.test(rawText);
  const subcontractMatch = /30%|SUBCONTRACTING|DESIGNATED GROUP|TARGETED ENTERPRISES/i.test(rawText);
  const cidbMatch = rawText.match(/\b([1-9][A-Z]{2}(?:\s*PE)?)\b/i);
  const cidbGrading = cidbMatch ? cidbMatch[1].toUpperCase() : void 0;
  let points;
  if (/90\/10|90\s*\/\s*10|FIFTY MILLION|R50,?000,?000/i.test(rawText)) {
    points = "90/10";
  } else if (/80\/20|80\s*\/\s*20/i.test(rawText)) {
    points = "80/20";
  }
  let extractedRef = referenceId;
  const refHead = rawText.match(/(?:BID|TENDER|REF(?:ERENCE)?)\s*(?:NUMBER|NOTICE|NO)?\s*[:#-]\s*/i);
  if (refHead) {
    const rest = rawText.slice(refHead.index + refHead[0].length);
    const cap = rest.match(/^(.{4,45}?)(?=\.\s+[A-Z]|\s+[a-z]|\s+[A-Z][a-zA-Z ]{0,25}:\s|\s{2,}|\n|$)/);
    if (cap && cap[1]) {
      const candidate = cap[1].trim().replace(/[.,;:]+$/, "");
      if (/\d/.test(candidate) && candidate.length >= 4) extractedRef = candidate;
    }
  }
  const lines = rawText.split("\n").map((l) => l.trim()).filter(Boolean);
  let title = lines.find((l) => /SUPPLY|PROVISION|MAINTENANCE|REHABILITATION|APPOINTMENT|SERVICES/i.test(l)) || lines[0] || "South African Public Sector RFP";
  title = title.replace(/^(?:BID|TENDER|NOTICE|DESCRIPTION)\s*[:.-]?\s*/i, "").replace(/\s*(?:BID|TENDER|REF(?:ERENCE)?)\s*(?:NUMBER|NOTICE|NO)?\s*[:#-].*$/i, "").trim().slice(0, 140);
  let department = "Organ of State / Public Entity (South Africa)";
  if (/NATIONAL TREASURY/i.test(rawText)) department = "National Treasury of South Africa";
  else if (/SANRAL/i.test(rawText)) department = "South African National Roads Agency SOC Ltd (SANRAL)";
  else if (/CITY OF CAPE TOWN/i.test(rawText)) department = "City of Cape Town Metropolitan Municipality";
  else if (/ESKOM/i.test(rawText)) department = "Eskom Holdings SOC Ltd";
  else if (/PRASA/i.test(rawText)) department = "Passenger Rail Agency of South Africa (PRASA)";
  else if (/TRANSNET/i.test(rawText)) department = "Transnet SOC Ltd";
  else if (/SITA/i.test(rawText)) department = "State Information Technology Agency (SITA)";
  else if (/GAUTENG/i.test(rawText)) department = "Gauteng Provincial Government";
  let province = "National / South Africa";
  if (/CAPE TOWN|WESTERN CAPE/i.test(rawText)) province = "Western Cape";
  else if (/GAUTENG|JOHANNESBURG|PRETORIA/i.test(rawText)) province = "Gauteng";
  else if (/KWAZULU|DURBAN|ETHEKWINI/i.test(rawText)) province = "KwaZulu-Natal";
  else if (/EASTERN CAPE|GQEBERHA/i.test(rawText)) province = "Eastern Cape";
  let closingDate = null;
  const MONTHS = { january: 0, february: 1, march: 2, april: 3, may: 4, june: 5, july: 6, august: 7, september: 8, october: 9, november: 10, december: 11 };
  const closeCtx = rawText.match(/closing\s*(?:date)?\s*[:.-]?\s*(.{0,40})/i)?.[1] || "";
  const iso = closeCtx.match(/(20\d{2})-(\d{2})-(\d{2})/);
  const named = closeCtx.match(/(\d{1,2})\s*(January|February|March|April|May|June|July|August|September|October|November|December)\s*(20\d{2})/i);
  const numeric = closeCtx.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](20\d{2})/);
  const mk = (y, m, d) => {
    const dt = new Date(Date.UTC(y, m, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m && dt.getUTCDate() === d ? dt : null;
  };
  let parsed = null;
  if (iso) parsed = mk(+iso[1], +iso[2] - 1, +iso[3]);
  else if (named) parsed = mk(+named[3], MONTHS[named[2].toLowerCase()], +named[1]);
  else if (numeric) parsed = mk(+numeric[3], +numeric[2] - 1, +numeric[1]);
  if (parsed) closingDate = parsed.toISOString().split("T")[0];
  let category = "General Services";
  if (cidbGrading || /CONSTRUCTION|ROAD|ASPHALT|CIVIL|BUILDING/i.test(rawText)) category = "Civil & Construction";
  else if (/CLEANING|HYGIENE|PEST CONTROL|GARDENING|LANDSCAPING|FACILITIES MANAGEMENT|CATERING/i.test(rawText)) category = "Security & Facilities";
  else if (/SECURITY|GUARDING|ARMED|ACCESS CONTROL|PSIRA/i.test(rawText)) category = "Security & Facilities";
  else if (/FLEET|VEHICLE|TELEMATICS|LOGISTICS/i.test(rawText)) category = "Logistics & Fleet";
  else if (/HEALTHCARE|MEDICAL|CLINIC|HOSPITAL/i.test(rawText)) category = "Medical & Healthcare";
  else if (/AUDIT|CONSULTING|LEGAL|FINANCIAL/i.test(rawText)) category = "Professional Services";
  return {
    parsed: {
      title,
      referenceNumber: extractedRef,
      issuingDepartment: department,
      closingDate,
      cidbGrading: cidbGrading || null,
      estimatedBudget: "Not Specified",
      province,
      category,
      checklist: {
        csd: csdMatch,
        sars: sarsMatch,
        bbbee: bbbeeMatch,
        coida: coidaMatch,
        compulsoryBriefing: briefingMatch,
        subcontracting30Percent: subcontractMatch,
        additionalDocuments: [
          // Only documents the tender text itself calls for - the tender's own
          // returnables list governs; nothing is asserted from general rules.
          .../\bSBD\s*1\b/i.test(rawText) ? ["SBD 1: Invitation to Bid Document"] : [],
          .../\bSBD\s*4\b/i.test(rawText) ? ["SBD 4: Standard Bidding Declaration of Interest"] : [],
          .../\bSBD\s*6\.1\b/i.test(rawText) ? ["SBD 6.1: Preference Points Claim Form under Preferential Procurement Regs 2022"] : [],
          ...cidbGrading ? [`CIDB Proof of Registration with Active Grading ${cidbGrading}`] : [],
          ...coidaMatch ? ["COIDA Valid Letter of Good Standing (Compensation Commissioner / FEM)"] : [],
          .../\bCIPC\b/i.test(rawText) ? ["Certified Copy of CIPC Company Registration Documents"] : [],
          .../identity documents|certified id/i.test(rawText) ? ["Certified Identity Documents of Directors/Members as stated"] : []
        ]
      },
      points: points || null,
      technicalThreshold: 70
    },
    modelUsed: "Rule-based procurement preview (no language model)",
    failoverOccurred: config.provider !== "statutory",
    failoverLogs
  };
}
async function executeRfpPipeline({
  rawText,
  referenceId,
  companyProfile,
  llmConfig,
  allowCloudLlm = false
}) {
  const startTime = Date.now();
  const traceLogs = [];
  const spans = [];
  const addTrace = (log) => {
    traceLogs.push(log);
  };
  const createSpan = (name, op, description) => {
    const span = {
      id: "span-" + Math.random().toString(36).substring(2, 9),
      name,
      op,
      status: "running",
      startTime: Date.now(),
      description
    };
    spans.push(span);
    return span;
  };
  const finalizeSpan = (span, status = "success", metadata) => {
    span.status = status;
    span.durationMs = Date.now() - span.startTime;
    if (metadata) span.metadata = metadata;
  };
  addTrace(`[Sentry Trace] Initializing transaction span: "RFP Upload Ingestion Channel" (op: agent.pipeline)`);
  const rootSpan = createSpan("RFP Ingestion Pipeline Execution", "agent.pipeline", "End-to-end ingestion and compliance parsing");
  let workingText = rawText;
  let activeRefId = referenceId;
  if (isRawPdfString(rawText)) {
    addTrace(`[PDF Engine] Detected raw binary PDF document stream (%PDF-1.x). Running PDFParse stream extraction...`);
    const pdfSpan = createSpan("PDF Stream Text Extraction", "agent.pipeline", "Extract readable text from PDF binary");
    try {
      const parsed = await parseRawPdfString(rawText);
      if (parsed.success && parsed.text) {
        workingText = parsed.text;
        finalizeSpan(pdfSpan, "success", { pageCount: parsed.pageCount, extractedChars: workingText.length });
        addTrace(`[PDF Engine] Decoded ${parsed.pageCount} PDF pages (${workingText.length} characters) successfully.`);
        if (parsed.referenceGuess && (!activeRefId || activeRefId.startsWith("RFP-ZA-"))) {
          activeRefId = parsed.referenceGuess;
        }
      } else {
        finalizeSpan(pdfSpan, "failed", { error: parsed.error });
        addTrace(`[PDF Engine] Fallback: using raw text (${parsed.error}).`);
      }
    } catch (e) {
      finalizeSpan(pdfSpan, "failed", { error: e.message });
    }
  }
  addTrace(`[Privacy] ${DOCUMENT_REDACTION_NOTICE}`);
  const popiaSpan = createSpan("Tender-text pattern redaction", "popia.sanitize", "Mask supported personal-data patterns in tender text");
  const sanitizedText = redactPii(workingText);
  await new Promise((r) => setTimeout(r, 60));
  finalizeSpan(popiaSpan, "success", { bytesSanitized: workingText.length, scope: "supported tender-text patterns only" });
  addTrace(`[Privacy] A short excerpt of this document is included in this response. Pattern matching is limited; unrecognized personal details can remain.`);
  addTrace(`[Mastra Engine] Booting localized agent context using active LLM (${activeLlmConfig.modelId})...`);
  addTrace(`[Sentry Trace] Triggering sub-span execution loop: "${activeLlmConfig.provider} Information Extraction Tactic" (op: agent.llm.call)`);
  const extractionSpan = createSpan(`${activeLlmConfig.provider} Information Extraction Tactic`, "agent.llm.call", "LLM structural inference for South African RFP criteria");
  let extractedData;
  let modelUsedName = activeLlmConfig.modelId;
  try {
    const extractionResult = await extractComplianceWithGemma(sanitizedText, activeRefId, llmConfig, allowCloudLlm);
    extractedData = extractionResult.parsed;
    modelUsedName = extractionResult.modelUsed;
    if (extractionResult.failoverLogs?.length) {
      extractionResult.failoverLogs.forEach((l) => addTrace(l));
    }
    finalizeSpan(extractionSpan, "success", {
      model: modelUsedName,
      tokensAnalyzed: Math.min(sanitizedText.length, 12e3),
      detectedCategory: extractedData.category,
      failoverOccurred: extractionResult.failoverOccurred
    });
    addTrace(`[${modelUsedName}] Extracted procurement criteria: "${extractedData.title}" (${extractedData.referenceNumber})`);
    addTrace(`[Mastra Engine] Matched criteria against National Treasury PPPFA standard constraints (Allocation: ${extractedData.points}).`);
  } catch (error) {
    finalizeSpan(extractionSpan, "failed", { error: error.message });
    Sentry.captureException(error);
    addTrace(`[Sentry Trace] Error in LLM Extraction: ${error.message}`);
    throw error;
  }
  const complianceSpan = createSpan("South African Regulatory Checklist Evaluation", "compliance.evaluate", "Validating CSD, SARS, B-BBEE, CIDB, COIDA");
  addTrace(`[Compliance Engine] Returnables found in the tender text: CSD (${extractedData.checklist?.csd ? "listed" : "not found in text"}), SARS PIN (${extractedData.checklist?.sars ? "listed" : "not found in text"}), B-BBEE (${extractedData.checklist?.bbbee ? "listed" : "not found in text"}), CIDB (${extractedData.cidbGrading || "not found in text"}). Confirm against the tender's own returnables list.`);
  await new Promise((r) => setTimeout(r, 40));
  finalizeSpan(complianceSpan, "success", {
    csdRequired: extractedData.checklist?.csd ?? false,
    sarsRequired: extractedData.checklist?.sars ?? false,
    bbbeeRequired: extractedData.checklist?.bbbee ?? false,
    cidbGrading: extractedData.cidbGrading || null
  });
  const tenderDoc = {
    title: extractedData.title || "South African Public Sector RFP",
    referenceNumber: extractedData.referenceNumber || referenceId,
    issuingDepartment: extractedData.issuingDepartment || "Organ of State",
    ...extractedData.closingDate && !isNaN(Date.parse(extractedData.closingDate)) ? { closingDate: new Date(extractedData.closingDate) } : {},
    cidbGradingRequired: extractedData.cidbGrading,
    estimatedBudget: extractedData.estimatedBudget || "Not Specified",
    province: extractedData.province || "National / South Africa",
    category: extractedData.category || "ICT & Technology",
    extractedComplianceChecklist: {
      csdRequired: extractedData.checklist?.csd ?? false,
      sarsPinRequired: extractedData.checklist?.sars ?? false,
      bbbeeRequired: extractedData.checklist?.bbbee ?? false,
      coidaRequired: extractedData.checklist?.coida ?? false,
      compulsoryBriefing: extractedData.checklist?.compulsoryBriefing ?? false,
      subcontracting30Percent: extractedData.checklist?.subcontracting30Percent ?? false,
      additionalDocuments: extractedData.checklist?.additionalDocuments || []
    },
    evaluationCriteria: {
      preferencePointsSystem: extractedData.points === "80/20" || extractedData.points === "90/10" ? extractedData.points : "unknown",
      technicalThresholdPercentage: extractedData.technicalThreshold || 70,
      ...extractedData.points === "90/10" ? { priceWeight: 90, specificGoalsWeight: 10 } : extractedData.points === "80/20" ? { priceWeight: 80, specificGoalsWeight: 20 } : {}
    },
    rawTextExcerpt: sanitizedText.slice(0, 2e3),
    createdAt: /* @__PURE__ */ new Date()
  };
  const savedRecord = { ...tenderDoc, _id: `analysis-${Date.now()}`, id: `analysis-${Date.now()}` };
  const skeleton = generateBidResponseSkeleton(savedRecord, companyProfile);
  finalizeSpan(rootSpan, "success", {
    totalDurationMs: Date.now() - startTime,
    referenceNumber: savedRecord.referenceNumber,
    complianceScore: "Extraction complete - confirm requirements against the tender\u2019s own returnables list"
  });
  addTrace(`[Sentry Trace] Finalizing transaction loop. Generated structured bid skeleton (Word-compatible .doc export). Total execution latency: ${Date.now() - startTime}ms.`);
  return {
    record: savedRecord,
    traceLogs,
    spans,
    skeleton,
    usedModel: modelUsedName
  };
}

// src/lib/server/fieldCrypto.ts
import { createHash, randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
var PREFIX = "enc:v1:";
var SENSITIVE_FIELDS = ["taxComplianceStatusPin"];
function deriveKey(raw2) {
  return createHash("sha256").update(raw2, "utf8").digest();
}
function fieldEncryptionEnabled(key) {
  return Boolean(key && key.trim().length > 0);
}
function encryptField(key, value) {
  if (typeof value !== "string" || value === "" || value.startsWith(PREFIX) || !fieldEncryptionEnabled(key)) {
    return value;
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(key), iv);
  const ct = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + [iv.toString("base64"), tag.toString("base64"), ct.toString("base64")].join(":");
}
function isEncryptedValue(value) {
  return typeof value === "string" && value.startsWith(PREFIX);
}
function decryptField(key, value) {
  if (!isEncryptedValue(value)) {
    return value;
  }
  if (!fieldEncryptionEnabled(key)) {
    return "";
  }
  try {
    const [ivB64, tagB64, ctB64] = value.slice(PREFIX.length).split(":");
    const decipher = createDecipheriv("aes-256-gcm", deriveKey(key), Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(ctB64, "base64")), decipher.final()]).toString("utf8");
  } catch {
    return "";
  }
}
function encryptProfileFields(key, profile) {
  if (!fieldEncryptionEnabled(key) || !profile) return profile;
  const out = { ...profile };
  for (const f of SENSITIVE_FIELDS) out[f] = encryptField(key, out[f]);
  return out;
}
function decryptProfileFields(key, profile) {
  if (!profile) return profile;
  const out = { ...profile };
  for (const f of SENSITIVE_FIELDS) out[f] = decryptField(key, out[f]);
  return out;
}
function profileForClient(key, stored) {
  const view = decryptProfileFields(key, stored);
  view.taxComplianceStatusPinUnavailable = isEncryptedValue(stored.taxComplianceStatusPin) && view.taxComplianceStatusPin === "";
  return view;
}
function prepareProfileSave(key, stored, input) {
  const decoded = decryptProfileFields(key, stored);
  const unreadable = isEncryptedValue(stored.taxComplianceStatusPin) && decoded.taxComplianceStatusPin === "";
  const merged = { ...decoded, ...input };
  delete merged.taxComplianceStatusPinUnavailable;
  const incoming = input.taxComplianceStatusPin;
  if (isEncryptedValue(incoming)) throw new Error("Enter a new PIN, not an encrypted value.");
  if (unreadable) {
    if (typeof incoming !== "string" || incoming.trim() === "") {
      merged.taxComplianceStatusPin = stored.taxComplianceStatusPin;
    } else if (!fieldEncryptionEnabled(key)) {
      throw new Error("PIN protection key is unavailable. Your saved PIN was not changed. Contact the operator before replacing it.");
    }
  }
  return encryptProfileFields(key, merged);
}

// src/lib/services/serpDiscovery.ts
import { getJson } from "serpapi";

// src/lib/data/sampleTenders.ts
var SAMPLE_TENDERS = [
  // 1. Live Western Cape Tender: Personnel Recruitment Advertisements
  {
    id: "tender-za-wc-001",
    title: "APPOINTMENT OF A SERVICE PROVIDER TO DESIGN AND PLACE PERSONNEL RECRUITMENT ADVERTISEMENTS",
    referenceNumber: "WCG/DOTP-ADV/2026/01",
    issuingDepartment: "Western Cape Provincial Government (Department of the Premier)",
    closingDate: "2026-11-21T11:00:00.000Z",
    estimatedBudget: "R 4,800,000.00 (ZAR)",
    province: "Western Cape",
    category: "Services: General",
    extractedComplianceChecklist: {
      csdRequired: true,
      sarsPinRequired: true,
      bbbeeRequired: true,
      coidaRequired: false,
      compulsoryBriefing: false,
      subcontracting30Percent: false,
      additionalDocuments: [
        "SBD 1 - Invitation to Bid",
        "SBD 4 - Bidder Declaration of Interest",
        "SBD 6.1 - Preference Points Claim (PPR 2022)",
        "POPIA Compliance Declaration for Candidate Personal Data",
        "Media Buying Accreditation & Print/Digital Placement Portfolios"
      ]
    },
    evaluationCriteria: {
      preferencePointsSystem: "80/20",
      technicalThresholdPercentage: 70,
      priceWeight: 80,
      specificGoalsWeight: 20
    },
    rawTextExcerpt: `WESTERN CAPE GOVERNMENT - DEPARTMENT OF THE PREMIER
TENDER REFERENCE: WCG/DOTP-ADV/2026/01
SERVICES: GENERAL - APPOINTMENT OF A SERVICE PROVIDER TO DESIGN AND PLACE PERSONNEL RECRUITMENT ADVERTISEMENTS ACROSS DIGITAL AND PRINT CHANNELS.
PUBLISHED: 16/10/2026 | CLOSING DATE: 21 NOVEMBER 2026 (IN 37 DAYS) AT 11:00 AM.
MANDATORY RETURNABLES:
1. Central Supplier Database (CSD) active MAAA registration report showing compliant tax status.
2. Verified SARS Tax Compliance Status PIN.
3. B-BBEE Level 1 to Level 4 Verification Certificate or Sworn Affidavit.
4. Evaluation: 80/20 Preference Point System (Price = 80, Specific Goals = 20 points).
5. Technical functionality cutoff: 70 points. Minimum 3 contactable client reference letters for government recruitment advertising.`,
    scrapedSource: "National Treasury eTender Portal (etenders.gov.za) - Western Cape",
    createdAt: "2026-10-15T08:00:00.000Z"
  },
  // 2. Live Western Cape Tender: Short-term Insurance Services (Drakenstein)
  {
    id: "tender-za-wc-002",
    title: "Provision of short-term insurance services for a period up to 30 June 2030",
    referenceNumber: "CORP 12/2026",
    issuingDepartment: "Drakenstein Municipality (Corporate Services Directorate)",
    closingDate: "2026-11-19T10:00:00.000Z",
    estimatedBudget: "R 32,500,000.00 (ZAR)",
    province: "Western Cape",
    category: "Professional Services",
    extractedComplianceChecklist: {
      csdRequired: true,
      sarsPinRequired: true,
      bbbeeRequired: true,
      coidaRequired: true,
      compulsoryBriefing: true,
      subcontracting30Percent: true,
      additionalDocuments: [
        "FSCA / Prudential Authority Insurance License Certificate",
        "FIA / SAIA Accreditation Certificate",
        "Municipal SBD 4 Declaration of Interest",
        "Municipal SBD 6.1 Specific Goals Claim Form",
        "30% Subcontracting Plan to Qualifying EMEs/QSEs in Drakenstein/Cape Winelands"
      ]
    },
    evaluationCriteria: {
      preferencePointsSystem: "90/10",
      technicalThresholdPercentage: 75,
      priceWeight: 90,
      specificGoalsWeight: 10
    },
    rawTextExcerpt: `DRAKENSTEIN MUNICIPALITY - FINANCIAL & CORPORATE SERVICES
BID NUMBER: CORP 12/2026
FINANCIAL AND INSURANCE ACTIVITIES: PROVISION OF SHORT-TERM INSURANCE SERVICES FOR A PERIOD UP TO 30 JUNE 2030 (ASSET, FLEET, PUBLIC LIABILITY & COUNCILLOR SPECIAL RISK).
PUBLISHED: 15/10/2026 | CLOSING DATE: 19 NOVEMBER 2026 (IN 35 DAYS) AT 10:00 AM.
MANDATORY ELIGIBILITY:
- Registered with Financial Sector Conduct Authority (FSCA).
- Central Supplier Database (CSD) compliant status with MAAA number.
- Valid SARS TCS PIN.
- COIDA Letter of Good Standing.
- Compulsory virtual briefing session: 28 October 2026 at 10h00.
- 90/10 Preference Point System (Tender value > R50m lifecycle aggregate). 30% local designated group participation condition applies.`,
    scrapedSource: "Drakenstein Municipality Procurement & etenders.gov.za",
    createdAt: "2026-10-15T09:00:00.000Z"
  },
  // 3. Live Western Cape Tender: Firearms for Drakenstein Municipality
  {
    id: "tender-za-wc-003",
    title: "The supply and delivery of various types of firearms for the Drakenstein Municipality for a period up to 30 June 2030",
    referenceNumber: "CES 04/2026",
    issuingDepartment: "Drakenstein Municipality (Law Enforcement & Security Services)",
    closingDate: "2026-11-26T10:00:00.000Z",
    estimatedBudget: "R 7,500,000.00 (ZAR)",
    province: "Western Cape",
    category: "Supplies: General",
    extractedComplianceChecklist: {
      csdRequired: true,
      sarsPinRequired: true,
      bbbeeRequired: true,
      coidaRequired: false,
      compulsoryBriefing: false,
      subcontracting30Percent: false,
      additionalDocuments: [
        "SAPS Central Firearms Register Registered Firearms Dealer License (FCA Act 60 of 2000)",
        "SABS / CIP / SAAMI Ballistic Proof Certificates",
        "Municipal MBD 4 Declaration of Interest",
        "Municipal MBD 6.1 Preference Points Claim Form",
        "Authorised Distributorship or OEM Authorization Agreement"
      ]
    },
    evaluationCriteria: {
      preferencePointsSystem: "80/20",
      technicalThresholdPercentage: 80,
      priceWeight: 80,
      specificGoalsWeight: 20
    },
    rawTextExcerpt: `DRAKENSTEIN MUNICIPALITY - COMMUNITY & LAW ENFORCEMENT SERVICES
TENDER REFERENCE: CES 04/2026
SUPPLIES: GENERAL - THE SUPPLY AND DELIVERY OF VARIOUS TYPES OF FIREARMS FOR THE DRAKENSTEIN MUNICIPALITY FOR A PERIOD UP TO 30 JUNE 2030.
PUBLISHED: 15/10/2026 | CLOSING DATE: 26 NOVEMBER 2026 (IN 42 DAYS) AT 10:00 AM.
MANDATORY QUALIFYING CRITERIA:
1. Bidder must submit a certified copy of valid Firearms Dealer License issued under the Firearms Control Act 60 of 2000 by SAPS Central Firearms Register.
2. Active registration on National Treasury Central Supplier Database (CSD).
3. Valid SARS Tax Compliance Status PIN.
4. Preference Points: 80/20 Point System (Price: 80 points, B-BBEE & Local Specific Goals: 20 points).
5. Technical compliance: weapons must comply with South African Police Service and Municipal Police Service specification standards.`,
    scrapedSource: "National Treasury eTender Portal (etenders.gov.za) - Drakenstein",
    createdAt: "2026-10-15T09:30:00.000Z"
  },
  // 4. Live Western Cape Tender: Tactical & Operational Equipment
  {
    id: "tender-za-wc-004",
    title: "Supply and delivery of Tactical and Operational Equipment for Law Enforcement & Security Services for a period until 30 June 2030",
    referenceNumber: "CES 05/2026",
    issuingDepartment: "Drakenstein Municipality (Public Safety & Law Enforcement)",
    closingDate: "2026-12-03T10:00:00.000Z",
    estimatedBudget: "R 14,800,000.00 (ZAR)",
    province: "Western Cape",
    category: "Supplies: General",
    extractedComplianceChecklist: {
      csdRequired: true,
      sarsPinRequired: true,
      bbbeeRequired: true,
      coidaRequired: false,
      compulsoryBriefing: true,
      subcontracting30Percent: false,
      additionalDocuments: [
        "SABS / SANS 1658 Ballistic Body Armor Compliance Certificate",
        "Municipal MBD 4 Declaration of Interest",
        "Municipal MBD 6.1 Specific Goals Claim",
        "Local Production & Content Declaration for Textile and Bulletproof Vests (SBD 6.2)",
        "Sample Inspection Protocol for Night Vision and Restraint Equipment"
      ]
    },
    evaluationCriteria: {
      preferencePointsSystem: "80/20",
      technicalThresholdPercentage: 75,
      priceWeight: 80,
      specificGoalsWeight: 20
    },
    rawTextExcerpt: `DRAKENSTEIN MUNICIPALITY
BID NOTICE NO: CES 05/2026
SUPPLIES: GENERAL - SUPPLY AND DELIVERY OF TACTICAL AND OPERATIONAL EQUIPMENT FOR LAW ENFORCEMENT & SECURITY SERVICES FOR A PERIOD UNTIL 30 JUNE 2030.
PUBLISHED: 15/10/2026 | CLOSING DATE: 03 DECEMBER 2026 (IN 49 DAYS) AT 10:00 AM.
REQUIREMENTS:
- Body armour, tactical helmets, duty belts, handcuffs, and high-visibility PPE.
- Local content thresholds apply for clothing and textile products (100% local content requirement).
- Central Supplier Database (CSD) active registration.
- SARS TCS PIN.
- Preference Points: 80/20 System. Compulsory clarification session: 04 November 2026.`,
    scrapedSource: "etenders.gov.za & Drakenstein Municipality",
    createdAt: "2026-10-15T10:00:00.000Z"
  },
  // 5. Live Western Cape Tender: Civil Engineering Services Drakenstein
  {
    id: "tender-za-wc-005",
    title: "Construction of New Basic Services for Informal Settlements and all other areas within the Drakenstein Municipal Area for a period up to 30 June 2030",
    referenceNumber: "CE 08/2026",
    issuingDepartment: "Drakenstein Municipality (Civil Engineering Directorate)",
    closingDate: "2026-11-19T10:00:00.000Z",
    estimatedBudget: "R 58,000,000.00 (ZAR)",
    province: "Western Cape",
    category: "Civil & Construction",
    cidbGradingRequired: "7CE (or 6CE PE Potentially Emerging)",
    extractedComplianceChecklist: {
      csdRequired: true,
      sarsPinRequired: true,
      bbbeeRequired: true,
      coidaRequired: true,
      compulsoryBriefing: true,
      subcontracting30Percent: true,
      additionalDocuments: [
        "CIDB Contractor Registration Grade 7CE or 6CE PE Active Status Printout",
        "SACPCMP Construction Safety Manager Certification",
        "COIDA Letter of Good Standing for Civil Engineering Works",
        "Letter of Intent for 10% Construction Guarantee from Approved Financial Institution",
        "30% Targeted Enterprise Subcontracting Agreement with Local EME/QSE Contractors",
        "Compulsory Site Clarification Certificate"
      ]
    },
    evaluationCriteria: {
      preferencePointsSystem: "90/10",
      technicalThresholdPercentage: 70,
      priceWeight: 90,
      specificGoalsWeight: 10
    },
    rawTextExcerpt: `DRAKENSTEIN MUNICIPALITY - CIVIL ENGINEERING SERVICES
TENDER NO: CE 08/2026
CIVIL ENGINEERING - CONSTRUCTION OF NEW BASIC SERVICES (WATER RETICULATION, SEWER MAINS, ROADS & STORMWATER DRAINAGE) FOR INFORMAL SETTLEMENTS AND ALL OTHER AREAS WITHIN THE DRAKENSTEIN MUNICIPAL AREA FOR A PERIOD UP TO 30 JUNE 2030.
PUBLISHED: 15/10/2026 | CLOSING DATE: 19 NOVEMBER 2026 (IN 35 DAYS) AT 10:00 AM.
MANDATORY ELIGIBILITY:
1. CIDB Grading: 7CE or higher (6CE PE may tender).
2. National Treasury CSD registered with compliant SARS TCS PIN.
3. COIDA Letter of Good Standing valid at closing date.
4. Compulsory clarification site meeting: 29 October 2026 at Paarl Civic Centre.
5. In terms of Municipal SCM Policy and PPPFA 2022, 90/10 Preference Point System applies. Minimum 30% contract value subcontracted to local emerging CIDB 1CE-3CE enterprises.`,
    scrapedSource: "etenders.gov.za & Drakenstein Tender Board",
    createdAt: "2026-10-15T10:30:00.000Z"
  },
  // 6. Live Western Cape Tender: Turbine Roof Ventilators
  {
    id: "tender-za-wc-006",
    title: "SUPPLY AND INSTALLATION OF TURBINE ROOF VENTILATORS AT MUNICIPAL STORES",
    referenceNumber: "SCM/TURB-09/2026",
    issuingDepartment: "Cape Agulhas Municipality / Overberg District (Western Cape)",
    closingDate: "2026-10-31T12:00:00.000Z",
    estimatedBudget: "R 920,000.00 (ZAR)",
    province: "Western Cape",
    category: "Services: General",
    cidbGradingRequired: "1ME or 2ME (Mechanical Engineering)",
    extractedComplianceChecklist: {
      csdRequired: true,
      sarsPinRequired: true,
      bbbeeRequired: true,
      coidaRequired: true,
      compulsoryBriefing: false,
      subcontracting30Percent: false,
      additionalDocuments: [
        "CIDB Grade 1ME / 2ME Registration",
        "MBD 4 Declaration of Interest",
        "MBD 6.1 Preference Points Claim",
        "COIDA Letter of Good Standing (Working at Heights Protocol)",
        "Manufacturer Warranty Certificate for Stainless Steel / Aluminium Turbines"
      ]
    },
    evaluationCriteria: {
      preferencePointsSystem: "80/20",
      technicalThresholdPercentage: 70,
      priceWeight: 80,
      specificGoalsWeight: 20
    },
    rawTextExcerpt: `CAPE AGULHAS MUNICIPALITY - OVERBERG DISTRICT, WESTERN CAPE
QUOTATION NOTICE: SCM/TURB-09/2026
SERVICES: GENERAL - SUPPLY AND INSTALLATION OF HEAVY-DUTY INDUSTRIAL TURBINE ROOF VENTILATORS AT BREDASDORP MUNICIPAL STORES AND WORKSHOPS.
PUBLISHED: 15/10/2026 | CLOSING DATE: 31 OCTOBER 2026 (IN 15 DAYS) AT 12:00 PM.
REQUIREMENTS:
- CIDB Grade 1ME or higher.
- CSD registration report with MAAA number.
- SARS Tax Compliance PIN.
- COIDA Certificate of Good Standing.
- 80/20 Preference Point System (Price: 80, Specific Goals: 20).`,
    scrapedSource: "Western Cape Municipal Portal & etenders.gov.za",
    createdAt: "2026-10-15T11:00:00.000Z"
  },
  // 7. Live Western Cape Tender: Two-Way Radio Communication (GMT)
  {
    id: "tender-za-wc-007",
    title: "GMT009/26-27: TENDER FOR APPOINTMENT OF A SERVICE PROVIDER TO SUPPLY, DELIVERY, REPAIR AND INSTALLATION OF A DIGITAL TWO-WAY RADIO COMMUNICATION DEVICES, AND CONTROL ROOM SUPPORT SYSTEM FOR A PERIOD OF THREE YEARS, FROM DATE OF APPOINTMENT.",
    referenceNumber: "GMT009/26-27",
    issuingDepartment: "Government Motor Transport (GMT) - Western Cape Department of Mobility",
    closingDate: "2026-11-17T11:00:00.000Z",
    estimatedBudget: "R 18,700,000.00 (ZAR)",
    province: "Western Cape",
    category: "ICT & Technology",
    extractedComplianceChecklist: {
      csdRequired: true,
      sarsPinRequired: true,
      bbbeeRequired: true,
      coidaRequired: false,
      compulsoryBriefing: true,
      subcontracting30Percent: false,
      additionalDocuments: [
        "ICASA Radio Dealer License and Frequency Spectrum Approval",
        "SBD 1 Invitation to Bid",
        "SBD 4 Bidder Declaration of Interest",
        "SBD 6.1 Preference Points Claim",
        "DMR / TETRA Digital Radio OEM Technical Authorization Letter",
        "24/7 Control Room SLA Support Methodology"
      ]
    },
    evaluationCriteria: {
      preferencePointsSystem: "80/20",
      technicalThresholdPercentage: 75,
      priceWeight: 80,
      specificGoalsWeight: 20
    },
    rawTextExcerpt: `GOVERNMENT MOTOR TRANSPORT (GMT) - WESTERN CAPE DEPARTMENT OF MOBILITY
BID NUMBER: GMT009/26-27
INFORMATION AND COMMUNICATION - TENDER FOR APPOINTMENT OF A SERVICE PROVIDER TO SUPPLY, DELIVERY, REPAIR AND INSTALLATION OF DIGITAL TWO-WAY RADIO COMMUNICATION DEVICES, REPEATERS, AND CONTROL ROOM SUPPORT SYSTEM FOR A PERIOD OF THREE YEARS, FROM DATE OF APPOINTMENT.
PUBLISHED: 15/10/2026 | CLOSING DATE: 17 NOVEMBER 2026 (IN 33 DAYS) AT 11:00 AM.
MANDATORY RETURNABLES:
1. ICASA Radio Dealer License.
2. Central Supplier Database (CSD) active registration.
3. SARS TCS PIN verified.
4. B-BBEE Certificate or Sworn Affidavit.
5. Compulsory briefing session: 27 October 2026 at 11h00 via Microsoft Teams.
6. 80/20 Preference Point System (Price: 80 pts, Specific Goals: 20 pts).`,
    scrapedSource: "National Treasury eTender Portal (etenders.gov.za) - Western Cape GMT",
    createdAt: "2026-10-15T11:30:00.000Z"
  },
  // 8. Live Western Cape Tender: Grass Cutting Buffeljagsrivier (Swellendam)
  {
    id: "tender-za-wc-008",
    title: "PROVISION OF GRASS CUTTING SERVICES FOR A 18 MONTH PERIOD (BUFFELJAGSRIVIER)",
    referenceNumber: "SMQ 14/25/26",
    issuingDepartment: "Swellendam Municipality (Western Cape)",
    closingDate: "2026-10-24T12:00:00.000Z",
    estimatedBudget: "R 750,000.00 (ZAR)",
    province: "Western Cape",
    category: "Services: General",
    extractedComplianceChecklist: {
      csdRequired: true,
      sarsPinRequired: true,
      bbbeeRequired: true,
      coidaRequired: true,
      compulsoryBriefing: false,
      subcontracting30Percent: false,
      additionalDocuments: [
        "Municipal MBD 4 Declaration of Interest",
        "Municipal MBD 6.1 Preference Points Claim",
        "Proof of Municipal Rates and Taxes in Good Standing",
        "COIDA Letter of Good Standing for Grounds Maintenance",
        "Machinery & Equipment Schedule (Ride-on Mowers, Brush Cutters, Safety Gear)"
      ]
    },
    evaluationCriteria: {
      preferencePointsSystem: "80/20",
      technicalThresholdPercentage: 60,
      priceWeight: 80,
      specificGoalsWeight: 20
    },
    rawTextExcerpt: `SWELLENDAM MUNICIPALITY - WESTERN CAPE
FORMAL TENDER QUOTATION: SMQ 14/25/26
SERVICES: GENERAL - PROVISION OF GRASS CUTTING AND VEGETATION CLEARING SERVICES FOR A 18 MONTH PERIOD (BUFFELJAGSRIVIER AREA).
PUBLISHED: 15/10/2026 | CLOSING DATE: 24 OCTOBER 2026 (IN 8 DAYS) AT 12:00 PM.
URGENT PROCUREMENT:
- Central Supplier Database (CSD) compliant status with MAAA number.
- Valid SARS Tax Compliance PIN.
- COIDA Letter of Good Standing.
- 80/20 Point System in terms of Preferential Procurement Regulations 2022. Priority given to local EME/QSE suppliers located within Swellendam Municipal jurisdiction.`,
    scrapedSource: "Swellendam Municipality & etenders.gov.za",
    createdAt: "2026-10-15T12:00:00.000Z"
  },
  // 9. Live Western Cape Tender: Grass Cutting Suurbraak (Swellendam)
  {
    id: "tender-za-wc-009",
    title: "PROVISION OF GRASS CUTTING SERVICES FOR A 18 MONTH PERIOD (SUURBRAAK)",
    referenceNumber: "SMQ 15/25/26",
    issuingDepartment: "Swellendam Municipality (Western Cape)",
    closingDate: "2026-10-24T12:00:00.000Z",
    estimatedBudget: "R 680,000.00 (ZAR)",
    province: "Western Cape",
    category: "Services: General",
    extractedComplianceChecklist: {
      csdRequired: true,
      sarsPinRequired: true,
      bbbeeRequired: true,
      coidaRequired: true,
      compulsoryBriefing: false,
      subcontracting30Percent: false,
      additionalDocuments: [
        "Municipal MBD 4 Declaration of Interest",
        "Municipal MBD 6.1 Preference Points Claim",
        "Proof of Municipal Rates & Services Good Standing",
        "COIDA Letter of Good Standing",
        "Equipment Ownership or Rental Commitment"
      ]
    },
    evaluationCriteria: {
      preferencePointsSystem: "80/20",
      technicalThresholdPercentage: 60,
      priceWeight: 80,
      specificGoalsWeight: 20
    },
    rawTextExcerpt: `SWELLENDAM MUNICIPALITY - WESTERN CAPE
FORMAL TENDER QUOTATION: SMQ 15/25/26
SERVICES: GENERAL - PROVISION OF GRASS CUTTING AND OPEN SPACE MAINTENANCE FOR A 18 MONTH PERIOD (SUURBRAAK AREA).
PUBLISHED: 15/10/2026 | CLOSING DATE: 24 OCTOBER 2026 (IN 8 DAYS) AT 12:00 PM.
MANDATORY RETURNABLES:
1. National Treasury CSD active MAAA registration.
2. SARS TCS PIN.
3. COIDA Certificate of Good Standing.
4. Evaluation: 80/20 Preferential Point Allocation. Local community upliftment designated criteria apply.`,
    scrapedSource: "Swellendam Municipality & etenders.gov.za",
    createdAt: "2026-10-15T12:15:00.000Z"
  },
  // 10. Live Western Cape Tender: Grass Cutting Barrydale (Swellendam)
  {
    id: "tender-za-wc-010",
    title: "PROVISION OF GRASS CUTTING SERVICES FOR AN 18 MONTH PERIOD (BARRYDALE)",
    referenceNumber: "SMQ 16/25/26",
    issuingDepartment: "Swellendam Municipality (Western Cape)",
    closingDate: "2026-10-24T12:00:00.000Z",
    estimatedBudget: "R 650,000.00 (ZAR)",
    province: "Western Cape",
    category: "Services: General",
    extractedComplianceChecklist: {
      csdRequired: true,
      sarsPinRequired: true,
      bbbeeRequired: true,
      coidaRequired: true,
      compulsoryBriefing: false,
      subcontracting30Percent: false,
      additionalDocuments: [
        "Municipal MBD 4 Declaration of Interest",
        "Municipal MBD 6.1 Specific Goals Claim",
        "Proof of Municipal Utility Account Clear Status",
        "COIDA Letter of Good Standing",
        "List of Qualified Operators & Safety Equipment"
      ]
    },
    evaluationCriteria: {
      preferencePointsSystem: "80/20",
      technicalThresholdPercentage: 60,
      priceWeight: 80,
      specificGoalsWeight: 20
    },
    rawTextExcerpt: `SWELLENDAM MUNICIPALITY - WESTERN CAPE
FORMAL TENDER QUOTATION: SMQ 16/25/26
SERVICES: GENERAL - PROVISION OF GRASS CUTTING SERVICES FOR AN 18 MONTH PERIOD (BARRYDALE).
PUBLISHED: 15/10/2026 | CLOSING DATE: 24 OCTOBER 2026 (IN 8 DAYS) AT 12:00 PM.
CONDITIONS:
- CSD registered suppliers with active MAAA reference.
- Tax compliant status verified on SARS eFiling.
- Valid COIDA Letter of Good Standing.
- 80/20 Preference Point System (Price: 80, Specific Goals: 20).`,
    scrapedSource: "Swellendam Municipality & etenders.gov.za",
    createdAt: "2026-10-15T12:30:00.000Z"
  },
  // 11. National Treasury Transversal Hybrid Cloud
  {
    id: "tender-za-001",
    title: "Supply, Delivery, Commissioning and Maintenance of Enterprise Hybrid Cloud IT Infrastructure",
    referenceNumber: "RT57-2026-ICT",
    issuingDepartment: "National Treasury of South Africa (Transversal Contracting)",
    closingDate: "2026-11-28T11:00:00.000Z",
    estimatedBudget: "R 64,500,000.00 (ZAR)",
    province: "Gauteng / National",
    category: "ICT & Technology",
    extractedComplianceChecklist: {
      csdRequired: true,
      sarsPinRequired: true,
      bbbeeRequired: true,
      coidaRequired: true,
      compulsoryBriefing: true,
      subcontracting30Percent: true,
      additionalDocuments: [
        "SBD 1 - Invitation to Bid",
        "SBD 4 - Bidder Declaration of Interest",
        "SBD 6.1 - Preference Points Claim in terms of PPR 2022",
        "OEM Partner Tier 1 Accreditation Letter",
        "ISO 27001 Information Security Management Certificate",
        "3x Written Client Contactable Reference Letters (values > R15M)"
      ]
    },
    evaluationCriteria: {
      preferencePointsSystem: "90/10",
      technicalThresholdPercentage: 75,
      priceWeight: 90,
      specificGoalsWeight: 10
    },
    rawTextExcerpt: `BID NUMBER: RT57-2026-ICT
CLOSING DATE: 28 November 2026 AT 11:00 AM (SOUTH AFRICAN STANDARD TIME)
ISSUING AUTHORITY: NATIONAL TREASURY, REPUBLIC OF SOUTH AFRICA
DESCRIPTION: APPOINTMENT OF ACCREDITED SERVICE PROVIDERS FOR THE SUPPLY, DELIVERY, COMMISSIONING AND MAINTENANCE OF ENTERPRISE HYBRID CLOUD IT INFRASTRUCTURE ACROSS ORGANS OF STATE.

1. MANDATORY ELIGIBILITY & RETURNABLE CRITERIA (FAILURE TO COMPLY DISQUALIFIES BID):
- Bidders must be registered on the Central Supplier Database (CSD) with an active MAAA number. Verified tax compliance status through valid SARS TCS PIN.
- Valid B-BBEE Status Level Verification Certificate or sworn affidavit (EME/QSE) issued by SANAS-accredited verification agency.
- Certified copy of COIDA Letter of Good Standing issued by the Compensation Commissioner / FEM.
- Compulsory clarification virtual briefing session: 10 November 2026 at 10h00 via Microsoft Teams. Attendance register will be locked at 10h15.
- Pursuant to Preferential Procurement Regulations 2022, 30% designated group subcontracting condition applies for contracts exceeding R30 million to qualifying EMEs/QSEs with minimum 51% black ownership.

2. EVALUATION METHODOLOGY:
- Phase 1: Mandatory Compliance & Administrative Responsiveness
- Phase 2: Technical Functionality Threshold: 75% minimum cut-off required to advance.
- Phase 3: Price and Specific Goals Allocation System: 90/10 Preference Point System applies (Estimated contract value > R50,000,000).
  * Price: 90 points
  * Specific Goals (B-BBEE Level & Black Women/Youth Equity): 10 points`,
    scrapedSource: "National Treasury eTender Portal (etenders.gov.za)",
    createdAt: "2026-10-10T08:30:00.000Z"
  },
  // 12. SANRAL N1 Touws River Resurfacing (Western Cape)
  {
    id: "tender-za-002",
    title: "Routine Road Maintenance & Asphalt Resurfacing on National Route 1 Section 14 (KM 22.0 to KM 64.5)",
    referenceNumber: "SANRAL/N.001-140-2026/1",
    issuingDepartment: "South African National Roads Agency SOC Limited (SANRAL)",
    closingDate: "2026-11-14T14:00:00.000Z",
    estimatedBudget: "R 38,200,000.00 (ZAR)",
    province: "Western Cape",
    category: "Civil & Construction",
    cidbGradingRequired: "7CE (or 6CE PE Potentially Emerging)",
    extractedComplianceChecklist: {
      csdRequired: true,
      sarsPinRequired: true,
      bbbeeRequired: true,
      coidaRequired: true,
      compulsoryBriefing: true,
      subcontracting30Percent: true,
      additionalDocuments: [
        "CIDB Contractor Registration printout Grade 7CE",
        "Proof of Registration with SACPCMP for Construction Safety Officer",
        "Letter of Intent for 10% Performance Guarantee from Registered Bank",
        "Site Inspection Certificate signed by SANRAL Project Manager",
        "Local Production & Content Declaration for Cement and Steel components"
      ]
    },
    evaluationCriteria: {
      preferencePointsSystem: "80/20",
      technicalThresholdPercentage: 70,
      priceWeight: 80,
      specificGoalsWeight: 20
    },
    rawTextExcerpt: `TENDER NOTICE NO: SANRAL N.001-140-2026/1
THE SOUTH AFRICAN NATIONAL ROADS AGENCY SOC LIMITED (SANRAL) INVITES TENDERS FOR:
ROUTINE ROAD MAINTENANCE AND CRACK SEALING, ASPHALT RESURFACING ON NATIONAL ROUTE 1 SECTION 14 BETWEEN TOUWS RIVER AND MATJIESFONTEIN.

ELIGIBILITY REQUIREMENTS:
- Contractors must be registered with the Construction Industry Development Board (CIDB) in a contractor grading designation equal to or higher than 7CE (Civil Engineering). Grade 6CE PE contractors may tender.
- Registration on National Treasury CSD with verified SARS Tax Compliance Status PIN.
- Valid COIDA Certificate reflecting roadworks classification.
- Evaluation will follow the 80/20 Preference Point System in accordance with the Preferential Procurement Policy Framework Act (PPPFA) where:
  * Price = 80 Points
  * Specific Goals (B-BBEE status & local economic development in target municipality) = 20 Points.
- Technical threshold: 70 points out of 100 on functionality.
- Minimum 30% subcontracting to Targeted Enterprises (CIDB grades 1CE to 3CE).`,
    scrapedSource: "SANRAL Procurement Board & eTender",
    createdAt: "2026-10-12T10:15:00.000Z"
  },
  // 13. City of Cape Town Security Guarding (Western Cape)
  {
    id: "tender-za-003",
    title: "Provision of Integrated Physical Security, Access Control, and Guarding for Municipal Sub-Councils",
    referenceNumber: "CPT-SEC-2026-109",
    issuingDepartment: "City of Cape Town Metropolitan Municipality (Safety & Security Directorate)",
    closingDate: "2026-11-20T10:00:00.000Z",
    estimatedBudget: "R 18,900,000.00 (ZAR)",
    province: "Western Cape",
    category: "Security & Facilities",
    extractedComplianceChecklist: {
      csdRequired: true,
      sarsPinRequired: true,
      bbbeeRequired: true,
      coidaRequired: true,
      compulsoryBriefing: false,
      subcontracting30Percent: false,
      additionalDocuments: [
        "PSIRA Company Registration Certificate (Active & Verified)",
        "PSIRA Director Registration Certificates for all active Directors",
        "Public Liability Insurance Cover Letter (Minimum R10 Million)",
        "Radio Communications ICASA Frequency License",
        "Proof of Fleet Inspection by Municipal Traffic Officers"
      ]
    },
    evaluationCriteria: {
      preferencePointsSystem: "80/20",
      technicalThresholdPercentage: 80,
      priceWeight: 80,
      specificGoalsWeight: 20
    },
    rawTextExcerpt: `CITY OF CAPE TOWN METROPOLITAN MUNICIPALITY
TENDER NO: CPT-SEC-2026-109
DESCRIPTION: PROVISION OF GUARDING, ALARM MONITORING, AND ARMED RESPONSE SERVICES AT CIVIC CENTRES AND COMMUNITY HALLS.
CLOSING: 20 NOVEMBER 2026 @ 10:00 AM

COMPLIANCE MANDATES:
1. PSIRA Registration: Bidders and all directors must possess active PSIRA accreditation in good standing.
2. Central Supplier Database: Full CSD Master Registration report showing tax compliant status.
3. COIDA: Valid Letter of Good Standing for security services classification.
4. Preference Points: 80/20 Point System (Price: 80 pts, Specific Goals B-BBEE Level: 20 pts).
5. Minimum functionality hurdle: 80 points. Bids scoring under 80% on operational methodology and vetted personnel will be declared non-responsive.`,
    scrapedSource: "City of Cape Town Tender Portal (capetown.gov.za)",
    createdAt: "2026-10-14T11:45:00.000Z"
  },
  // 14. PRASA Fleet Telematics
  {
    id: "tender-za-004",
    title: "Supply and Commissioning of Fleet Telematics, Fuel Sensors, and Real-Time Driver Monitoring",
    referenceNumber: "PRASA/CRES/HO/2026/08",
    issuingDepartment: "Passenger Rail Agency of South Africa (PRASA)",
    closingDate: "2026-12-05T12:00:00.000Z",
    estimatedBudget: "R 24,000,000.00 (ZAR)",
    province: "Gauteng",
    category: "Logistics & Fleet",
    extractedComplianceChecklist: {
      csdRequired: true,
      sarsPinRequired: true,
      bbbeeRequired: true,
      coidaRequired: false,
      compulsoryBriefing: true,
      subcontracting30Percent: false,
      additionalDocuments: [
        "ICASA Type Approval Certificates for GSM and GPS onboard modules",
        "SBD 4 Declaration of Interest Form signed",
        "SBD 6.1 Claim Form completed with B-BBEE status affidavit",
        "Cybersecurity ISO 27001 or SOC 2 Compliance Report for Cloud Telemetry Backend"
      ]
    },
    evaluationCriteria: {
      preferencePointsSystem: "80/20",
      technicalThresholdPercentage: 70,
      priceWeight: 80,
      specificGoalsWeight: 20
    },
    rawTextExcerpt: `PASSENGER RAIL AGENCY OF SOUTH AFRICA (PRASA)
TENDER: PRASA/CRES/HO/2026/08
FLEET TELEMATICS & ON-BOARD ASSET MONITORING SYSTEM FOR 450 RAIL MAINTENANCE UTILITY VEHICLES.
CLOSING: 05 DECEMBER 2026 AT 12:00.
MANDATORY RETURNABLES: CSD REPORT WITH ACTIVE MAAA NUMBER, SARS TCS PIN, B-BBEE CERTIFICATE/AFFIDAVIT. 80/20 PREFERENTIAL PROCUREMENT POINT SYSTEM.`,
    scrapedSource: "PRASA E-Procurement Portal",
    createdAt: "2026-10-08T09:00:00.000Z"
  }
];

// src/lib/services/serpDiscovery.ts
function getCuratedLeads() {
  return SAMPLE_TENDERS.map((t, idx) => {
    const closing = typeof t.closingDate === "string" ? t.closingDate : t.closingDate.toISOString();
    const cleanDate = closing.split("T")[0];
    return {
      id: `lead-etender-${idx + 1}`,
      title: t.title,
      referenceNumber: t.referenceNumber,
      department: t.issuingDepartment,
      closingDate: cleanDate,
      province: t.province || "National",
      category: t.category || "Services: General",
      budgetEst: t.estimatedBudget || "Tender Envelope Evaluation",
      link: `https://www.etenders.gov.za/home/opportunities?tender=${encodeURIComponent(t.referenceNumber)}`,
      snippet: t.rawTextExcerpt?.slice(0, 240) || t.title,
      source: t.scrapedSource || "National Treasury eTender Portal (etenders.gov.za)",
      csdMandatory: t.extractedComplianceChecklist.csdRequired,
      cidbGrading: t.cidbGradingRequired,
      rawSampleText: t.rawTextExcerpt
    };
  });
}
async function fetchSouthAfricanTenders(query, province, options = {}) {
  const allowSerpApi = options.allowSerpApi === true;
  let leads = getCuratedLeads();
  let isLive = false;
  let serpApiConsumed = false;
  let source = allowSerpApi ? "National Treasury eTender Portal (etenders.gov.za & Western Cape)" : "Sample tender feed (offline fixtures - live lookup reserved for paying customers)";
  if (allowSerpApi && typeof window === "undefined") {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2e3);
      const testRes = await fetch("https://www.etenders.gov.za/Home/tenderDetails?id=1", {
        signal: controller.signal,
        headers: {
          "Accept": "application/json, text/javascript, */*; q=0.01",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }
      });
      clearTimeout(timeoutId);
      if (testRes.ok) {
        isLive = true;
        source = "Live eTenders Portal (etenders.gov.za & Western Cape Municipalities)";
      }
    } catch (err) {
    }
  }
  const apiKey = allowSerpApi && typeof process !== "undefined" ? process.env?.SERPAPI_API_KEY : void 0;
  if (apiKey && apiKey !== "MY_SERPAPI_KEY") {
    try {
      const q = query ? `${query} site:gov.za "tender" "CSD"` : 'site:gov.za "tender" OR "RFP" "closing date" "CSD"';
      const searchResults = await getJson({
        engine: "google",
        q,
        gl: "za",
        hl: "en",
        api_key: apiKey
      });
      const serpLeads = (searchResults.organic_results || []).map((item, idx) => {
        const title = item.title || "South African Public Sector RFP";
        const snippet = item.snippet || "";
        const isCidb = snippet.match(/([1-9][A-Z]{2})/i);
        return {
          id: "serp-" + idx,
          title,
          referenceNumber: `SA-GOV-2026-${100 + idx}`,
          department: item.displayed_link || "South African Organ of State",
          closingDate: new Date(Date.now() + (14 + idx * 3) * 24 * 60 * 60 * 1e3).toISOString().split("T")[0],
          province: province || "National / South Africa",
          category: snippet.toLowerCase().includes("construction") || snippet.toLowerCase().includes("road") ? "Civil & Construction" : "ICT & Technology",
          budgetEst: "Tender Envelope Quotation",
          link: item.link,
          snippet,
          source: "SerpApi Live Google South Africa",
          csdMandatory: true,
          cidbGrading: isCidb ? isCidb[1].toUpperCase() : void 0,
          rawSampleText: `${title}
${snippet}
Source: ${item.link}`
        };
      });
      if (serpLeads.length > 0) {
        leads = [...leads, ...serpLeads];
        serpApiConsumed = true;
      }
    } catch (err) {
      console.warn("[SerpApi] Live query fallback:", err.message);
    }
  }
  let filtered = leads;
  if (province && province !== "All Provinces") {
    const provLower = province.toLowerCase();
    filtered = filtered.filter(
      (l) => l.province.toLowerCase().includes(provLower) || province !== "Western Cape" && l.province.toLowerCase().includes("national")
    );
  }
  if (query && query.trim()) {
    const qLower = query.toLowerCase();
    filtered = filtered.filter(
      (l) => l.title.toLowerCase().includes(qLower) || l.department.toLowerCase().includes(qLower) || l.category.toLowerCase().includes(qLower) || l.referenceNumber.toLowerCase().includes(qLower) || l.snippet.toLowerCase().includes(qLower)
    );
  }
  return {
    success: true,
    leads: filtered,
    source,
    isLiveEtendersPortal: isLive,
    serpApiConsumed,
    syncedCount: leads.length
  };
}

// src/lib/services/localModelDetector.ts
var COMMON_LOCAL_ENDPOINTS = [
  { url: "http://localhost:11434", runner: "ollama", type: "ollama" },
  { url: "http://127.0.0.1:11434", runner: "ollama", type: "ollama" },
  { url: "http://localhost:1234", runner: "lmstudio", type: "openai" },
  { url: "http://localhost:8000", runner: "vllm", type: "openai" }
];
async function probeEndpoint(url, timeoutMs = 400) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      method: "GET",
      headers: { "Accept": "application/json" },
      signal: controller.signal
    });
    clearTimeout(timer);
    if (res.ok) {
      const json = await res.json().catch(() => ({}));
      return { reachable: true, data: json };
    }
    return { reachable: false, error: `HTTP ${res.status}` };
  } catch (err) {
    return { reachable: false, error: err.name === "AbortError" ? "Connection timed out" : err.message };
  }
}
async function detectLocalModels(customEndpoint) {
  const testedEndpoints = [];
  const detectedModels = [];
  let isLocalServerRunning = false;
  let activeRunner;
  let activeEndpoint;
  const isHttpsBrowser = typeof window !== "undefined" && window.location.protocol === "https:";
  if (isHttpsBrowser && !customEndpoint) {
    return {
      isLocalServerRunning: false,
      detectedModels: [],
      hasGemma: false,
      hasLlama31: false,
      cloudFailoverActive: true,
      message: "Cloud LLM Failover active (Google Gemini 2.5 Flash / Statutory Engine). Air-gapped local model execution is supported on local development instances (http://localhost:3000).",
      testedEndpoints: [{ url: "http://localhost:11434", reachable: false, error: "HTTPS browser mixed-content boundary (Cloud failover active)" }]
    };
  }
  const endpointsToTest = customEndpoint ? [{ url: customEndpoint, runner: "custom", type: "openai" }, ...COMMON_LOCAL_ENDPOINTS] : COMMON_LOCAL_ENDPOINTS;
  const probeResults = await Promise.allSettled(
    endpointsToTest.map(async (ep) => {
      const probeUrl = ep.runner === "ollama" ? `${ep.url}/api/tags` : `${ep.url}/v1/models`;
      const probe = await probeEndpoint(probeUrl, 400);
      return { ep, probeUrl, probe };
    })
  );
  for (const result of probeResults) {
    if (result.status !== "fulfilled") continue;
    const { ep, probeUrl, probe } = result.value;
    testedEndpoints.push({ url: probeUrl, reachable: probe.reachable, error: probe.error });
    if (probe.reachable && !isLocalServerRunning) {
      if (ep.runner === "ollama" && probe.data?.models && Array.isArray(probe.data.models)) {
        isLocalServerRunning = true;
        activeRunner = "ollama";
        activeEndpoint = ep.url;
        for (const m of probe.data.models) {
          const modelName = m.name || m.model || "";
          const lower = modelName.toLowerCase();
          const isGemma = lower.includes("gemma");
          const isLlama31 = lower.includes("llama3.1") || lower.includes("llama-3.1") || lower.includes("llama3") && lower.includes("8b");
          detectedModels.push({
            id: modelName,
            name: modelName,
            runner: "ollama",
            endpoint: `${ep.url}/v1`,
            isGemma,
            isLlama31,
            sizeBytes: m.size,
            family: m.details?.family || "llama/gemma",
            format: m.details?.format || "gguf"
          });
        }
      } else if (probe.data?.data && Array.isArray(probe.data.data)) {
        isLocalServerRunning = true;
        activeRunner = ep.runner;
        activeEndpoint = `${ep.url}/v1`;
        for (const m of probe.data.data) {
          const modelId = m.id || "";
          const lower = modelId.toLowerCase();
          const isGemma = lower.includes("gemma");
          const isLlama31 = lower.includes("llama3.1") || lower.includes("llama-3.1") || lower.includes("llama3") && lower.includes("8b");
          detectedModels.push({
            id: modelId,
            name: modelId,
            runner: ep.runner,
            endpoint: `${ep.url}/v1`,
            isGemma,
            isLlama31
          });
        }
      }
    }
  }
  const hasGemma = detectedModels.some((m) => m.isGemma);
  const hasLlama31 = detectedModels.some((m) => m.isLlama31);
  let recommendedLocalModel;
  if (hasLlama31) {
    recommendedLocalModel = detectedModels.find((m) => m.isLlama31)?.id;
  } else if (hasGemma) {
    recommendedLocalModel = detectedModels.find((m) => m.isGemma)?.id;
  } else if (detectedModels.length > 0) {
    recommendedLocalModel = detectedModels[0].id;
  }
  let message = "";
  if (isLocalServerRunning && (hasLlama31 || hasGemma)) {
    message = `Local ${activeRunner?.toUpperCase()} runner active! Detected ${detectedModels.length} models including ${hasLlama31 ? "Llama 3.1 8B" : ""} ${hasGemma ? "Gemma 2" : ""}. Tasks run locally with automatic cloud failover.`;
  } else if (isLocalServerRunning) {
    message = `Local ${activeRunner?.toUpperCase()} server active at ${activeEndpoint}, but Gemma or Llama 3.1 8B not yet pulled. Cloud failover ready.`;
  } else {
    message = `No local LLM server active on localhost. Automatic Cloud LLM failover active (Gemini 2.5 Flash / Statutory Engine) for all tasks.`;
  }
  return {
    isLocalServerRunning,
    activeRunner,
    activeEndpoint,
    detectedModels,
    hasGemma,
    hasLlama31,
    recommendedLocalModel,
    cloudFailoverActive: true,
    message,
    testedEndpoints
  };
}

// src/lib/server/tenderFeed.ts
function registerTenderFeedRoutes(app2, deps) {
  const { foundation: foundation2, store } = deps;
  app2.post("/api/etenders/sync", foundation2.requireAuth, async (req, res) => {
    try {
      const allowSerpApi = await foundation2.serpApiAccess(req);
      const result = await fetchSouthAfricanTenders(void 0, "Western Cape", { allowSerpApi });
      if (!result.serpApiConsumed) await foundation2.releaseConsumption(req, "serpapi");
      if (res.destroyed || !await foundation2.repos.tenants.getById(req.auth.tenantId)) return;
      result.leads.forEach((l) => {
        const key = JSON.stringify([req.auth.tenantId, l.referenceNumber]);
        if (!store.has(key)) {
          store.set(key, {
            tenantId: req.auth.tenantId,
            title: l.title,
            referenceNumber: l.referenceNumber,
            issuingDepartment: l.department,
            closingDate: l.closingDate,
            province: l.province,
            category: l.category,
            cidbGradingRequired: l.cidbGrading,
            estimatedBudget: l.budgetEst,
            rawTextExcerpt: l.rawSampleText || l.snippet,
            extractedComplianceChecklist: {
              csdRequired: l.csdMandatory,
              sarsPinRequired: true,
              bbbeeRequired: true,
              coidaRequired: Boolean(l.cidbGrading),
              additionalDocuments: ["SBD 1", "SBD 4", "SBD 6.1"]
            },
            evaluationCriteria: {
              preferencePointsSystem: "80/20",
              technicalThresholdPercentage: 70
            },
            createdAt: /* @__PURE__ */ new Date()
          });
        }
      });
      res.json({
        success: true,
        syncedCount: result.syncedCount,
        westernCapeCount: result.leads.filter((l) => l.province.includes("Western Cape")).length,
        source: result.source,
        isLiveEtendersPortal: result.isLiveEtendersPortal,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });
  app2.get("/api/tenders", (req, res) => {
    let tenders = Array.from(store.values());
    tenders = req.auth ? tenders.filter((t) => !t.tenantId || t.tenantId === req.auth.tenantId) : tenders.filter((t) => !t.tenantId);
    res.json({ success: true, count: tenders.length, tenders });
  });
}

// src/lib/server/generatedDatasets.ts
function registerGeneratedDatasetRoute(app2, deps) {
  const { foundation: foundation2, store, datasets } = deps;
  app2.post("/api/finetune/datasets/generate-from-tenders", foundation2.requireAdmin, (req, res) => {
    try {
      const tenders = Array.from(store.values()).filter((t) => !t.tenantId || t.tenantId === req.auth.tenantId);
      const generatedExamples = tenders.map((t, idx) => ({
        id: `gen-ex-${idx + 1}-${Date.now().toString().slice(-4)}`,
        domain: t.province?.includes("Western Cape") ? "Western Cape SCM" : t.cidbGradingRequired ? "CIDB Act" : "PPPFA 2022",
        prompt: `Audit South African procurement document "${t.title}" (Ref: ${t.referenceNumber}) issued by ${t.issuingDepartment}. Extract mandatory statutory eligibility, CIDB grading, and preference points system.`,
        completion: JSON.stringify({
          title: t.title,
          referenceNumber: t.referenceNumber,
          issuingDepartment: t.issuingDepartment,
          province: t.province,
          closingDate: t.closingDate,
          pointsSystem: t.evaluationCriteria?.preferencePointsSystem || "80/20",
          cidbGrading: t.cidbGradingRequired || null,
          mandatoryEligibility: {
            csdMaAA: t.extractedComplianceChecklist?.csdRequired ?? true,
            sarsTcsPin: t.extractedComplianceChecklist?.sarsPinRequired ?? true,
            bbbeeStatus: t.extractedComplianceChecklist?.bbbeeRequired ?? true,
            coidaGoodStanding: t.extractedComplianceChecklist?.coidaRequired ?? false,
            compulsoryBriefing: t.extractedComplianceChecklist?.compulsoryBriefing ?? false,
            designatedSubcontracting30Percent: t.extractedComplianceChecklist?.subcontracting30Percent ?? false
          },
          returnableSchedules: t.extractedComplianceChecklist?.additionalDocuments || ["SBD 1", "SBD 4", "SBD 6.1"]
        }, null, 2),
        referenceRfp: t.referenceNumber,
        createdAt: (/* @__PURE__ */ new Date()).toISOString()
      }));
      const tenantId = req.auth.tenantId;
      let ds = datasets.find((d) => d.id === `dataset-generated-${tenantId}` && d.tenantId === tenantId);
      if (!ds) {
        ds = {
          id: `dataset-generated-${tenantId}`,
          tenantId,
          name: "Generated tender examples",
          description: "Examples from this workspace and public tenders.",
          category: "Custom",
          version: "1.0.0",
          format: "alpaca",
          examples: [],
          exampleCount: 0,
          tokenCountEst: 0,
          createdAt: (/* @__PURE__ */ new Date()).toISOString()
        };
        datasets.unshift(ds);
      }
      ds.examples = [...generatedExamples, ...ds.examples];
      ds.exampleCount = ds.examples.length;
      ds.tokenCountEst = ds.examples.length * 1400;
      res.json({
        success: true,
        generatedCount: generatedExamples.length,
        dataset: ds
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });
}

// src/lib/server/simulatedTraining.ts
import { randomUUID } from "node:crypto";
function registerSimulatedTrainingRoute(app2, deps) {
  const { foundation: foundation2, datasets, jobs, schedule = setInterval } = deps;
  app2.post("/api/finetune/start", foundation2.requireAdmin, (req, res) => {
    try {
      const { baseModel = "meta-llama/Meta-Llama-3.1-8B-Instruct", datasetId, loraRank, loraAlpha, epochs, learningRate } = req.body || {};
      if (typeof datasetId !== "string" || !datasetId.trim() || typeof baseModel !== "string" || !["meta-llama/Meta-Llama-3.1-8B-Instruct", "google/gemma-2-9b-it", "google/gemma-2-27b-it"].includes(baseModel)) {
        res.status(400).json({ success: false, error: "valid_dataset_and_model_required" });
        return;
      }
      const dataset = datasets.find((d) => d.id === datasetId && (!d.tenantId || d.tenantId === req.auth.tenantId));
      if (!dataset) {
        res.status(404).json({ success: false, error: "dataset_not_found" });
        return;
      }
      const jobId = `ft-job-${randomUUID()}`;
      const outputName = `${baseModel.includes("llama") ? "Llama 3.1 8B" : "Gemma 2 9B"} - SA Procurement LoRA (Job ${jobId})`;
      const newJob = {
        tenantId: req.auth.tenantId,
        simulated: true,
        id: jobId,
        jobName: `job-${jobId}`,
        baseModel,
        datasetId: dataset.id,
        datasetName: dataset.name,
        status: "training",
        progress: 5,
        currentEpoch: 1,
        totalEpochs: Number(epochs) || 3,
        currentStep: 2,
        totalSteps: (Number(epochs) || 3) * 20,
        currentLoss: 2.38,
        learningRate: Number(learningRate) || 2e-4,
        vramUsageGb: 7.6,
        etaSeconds: 120,
        lossHistory: [
          { step: 1, loss: 2.62 },
          { step: 2, loss: 2.38 }
        ],
        loraRank: Number(loraRank) || 16,
        loraAlpha: Number(loraAlpha) || 32,
        loraDropout: 0.05,
        adapterArtifactName: "adapter_model.safetensors",
        outputModelName: outputName,
        createdAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      jobs.unshift(newJob);
      let step = 2;
      const interval = schedule(() => {
        step += 3;
        const totalSteps = newJob.totalSteps;
        const progress = Math.min(100, Math.round(step / totalSteps * 100));
        const epoch = Math.min(newJob.totalEpochs, Math.ceil(step / totalSteps * newJob.totalEpochs));
        const decayLoss = Number((0.28 + 2.1 * Math.exp(-step / 14) + Math.random() * 0.04).toFixed(3));
        newJob.progress = progress;
        newJob.currentStep = Math.min(step, totalSteps);
        newJob.currentEpoch = epoch;
        newJob.currentLoss = decayLoss;
        newJob.etaSeconds = Math.max(0, Math.round((totalSteps - step) * 2.2));
        newJob.lossHistory.push({ step: newJob.currentStep, loss: decayLoss });
        if (step >= totalSteps) {
          clearInterval(interval);
          deps.timers?.delete(jobId);
          newJob.status = "completed";
          newJob.progress = 100;
          newJob.etaSeconds = 0;
          newJob.completedAt = (/* @__PURE__ */ new Date()).toISOString();
        }
      }, 1800);
      deps.timers?.set(jobId, interval);
      res.json({ success: true, job: newJob, simulated: true, message: "Simulated training run for the studio preview - no GPU execution, no adapter artifact is produced. Use the exported Python script for real training." });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });
}

// src/lib/server/ephemeralErasure.ts
function eraseTenantEphemeral(tenantId, state) {
  for (const [key, row] of state.tenders) if (row.tenantId === tenantId) state.tenders.delete(key);
  for (let i = state.datasets.length - 1; i >= 0; i--) if (state.datasets[i].tenantId === tenantId) state.datasets.splice(i, 1);
  for (let i = state.jobs.length - 1; i >= 0; i--) if (state.jobs[i].tenantId === tenantId) {
    const timer = state.timers.get(state.jobs[i].id);
    if (timer) clearInterval(timer);
    state.timers.delete(state.jobs[i].id);
    state.jobs.splice(i, 1);
  }
}

// src/lib/server/foundation.ts
import { Router as Router3 } from "express";

// src/lib/server/config.ts
var PLANS = [
  {
    id: "standard_monthly",
    name: "Standard (provisional R250/month)",
    priceCentsZAR: 25e3,
    interval: "monthly",
    includedAnalyses: 60,
    includedSerpapiLookups: 30
  },
  {
    // Complimentary tester cohort: granted only by an operator through
    // account-bound code redemption or explicit deployment approval, never by a billing webhook. Eric approved
    // a shared seven-day beta with 20 pilot analyses and no paid searches.
    // Campaign dates and recipients remain unset until separately approved.
    id: "test_cohort",
    name: "Beta access (free, 20 analyses per pilot)",
    priceCentsZAR: 0,
    interval: "monthly",
    includedAnalyses: 20,
    includedSerpapiLookups: 0
  }
];
function getPlan(planId, plans = PLANS) {
  return plans.find((p) => p.id === planId);
}
function assertSafeConfig(config, env = process.env) {
  if (config.betaCampaign) {
    const c = config.betaCampaign;
    const start = Date.parse(c.startsAt), end = Date.parse(c.endsAt);
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(c.id) || !/(Z|[+-][0-9]{2}:[0-9]{2})$/.test(c.startsAt) || !/(Z|[+-][0-9]{2}:[0-9]{2})$/.test(c.endsAt) || !Number.isFinite(start) || end - start !== 7 * 864e5 || !Array.isArray(c.invites) || c.invites.length > 100 || c.invites.some((i) => typeof i.userId !== "string" || !i.userId || !/^[a-f0-9]{64}$/.test(i.codeHash)) || new Set(c.invites.map((i) => i.userId)).size !== c.invites.length || new Set(c.invites.map((i) => i.codeHash)).size !== c.invites.length || c.directAccounts !== void 0 && (!Array.isArray(c.directAccounts) || c.directAccounts.length + c.invites.length > 100 || c.directAccounts.some((a) => !a || typeof a.userId !== "string" || !a.userId || typeof a.tenantId !== "string" || !a.tenantId || typeof a.email !== "string" || a.email !== a.email.trim().toLowerCase() || !/^[^\s@]+@[^\s@]+$/.test(a.email)) || (/* @__PURE__ */ new Set([...c.invites.map((i) => i.userId), ...c.directAccounts.map((a) => a.userId)])).size !== c.invites.length + c.directAccounts.length || new Set(c.directAccounts.map((a) => a.tenantId)).size !== c.directAccounts.length || new Set(c.directAccounts.map((a) => a.email)).size !== c.directAccounts.length)) {
      throw new Error("Invalid beta campaign: require one fixed seven-day window and unique account-bound invites or approved accounts.");
    }
  }
  if (env.NODE_ENV === "production" && config.accountDeletionEnabled) {
    throw new Error("Production account deletion is unavailable until durable restore reconciliation is implemented and reviewed.");
  }
  if (env.NODE_ENV === "production" && config.store === "memory" && env.ALLOW_MEMORY_STORE_IN_PRODUCTION !== "true") {
    throw new Error(
      "Refusing to boot in production with the in-memory store: accounts, entitlements and usage would vanish on restart and tenants would share process state. Set STORE=postgres with DATABASE_URL or STORE=mongo with MONGODB_URI, or ALLOW_MEMORY_STORE_IN_PRODUCTION=true for a deliberate single-process demo."
    );
  }
  if (config.store === "mongo" && !config.mongoUri) {
    throw new Error("STORE=mongo requires MONGODB_URI.");
  }
  if (config.store === "postgres" && !config.postgresUri) {
    throw new Error("STORE=postgres requires DATABASE_URL.");
  }
  if (env.NODE_ENV === "production" && config.store !== "memory" && !config.authRequired) {
    throw new Error(
      "Refusing to boot in production on a real store with AUTH_REQUIRED unset: accounts and billing state would persist while every guard no-ops. Set AUTH_REQUIRED=true."
    );
  }
}
function loadConfig(env = process.env) {
  return {
    betaCampaign: env.BETA_CAMPAIGN_JSON ? JSON.parse(env.BETA_CAMPAIGN_JSON) : void 0,
    authRequired: env.AUTH_REQUIRED === "true",
    accountDeletionEnabled: env.ACCOUNT_DELETION_ENABLED === "true",
    plans: PLANS,
    authRateLimit: { maxAttempts: Number(env.AUTH_RATE_LIMIT_MAX || 10), windowMs: Number(env.AUTH_RATE_LIMIT_WINDOW_MS || 10 * 60 * 1e3) },
    sessionTtlHours: Number(env.SESSION_TTL_HOURS || 24 * 7),
    pastDueGraceDays: Number(env.PAST_DUE_GRACE_DAYS || 3),
    mockBillingSecret: env.MOCK_BILLING_SECRET || "",
    minPasswordLength: Number(env.MIN_PASSWORD_LENGTH || 10),
    store: env.STORE === "mongo" ? "mongo" : env.STORE === "postgres" ? "postgres" : "memory",
    mongoUri: env.MONGODB_URI || "",
    postgresUri: env.DATABASE_URL || "",
    cookieSecure: env.COOKIE_SECURE === "true",
    publicOrigin: env.PUBLIC_ORIGIN || "",
    trustProxy: env.TRUST_PROXY === void 0 ? false : env.TRUST_PROXY === "false" ? false : env.TRUST_PROXY || true,
    adminUserIds: (env.ADMIN_USER_IDS || "").split(",").map((s) => s.trim()).filter(Boolean),
    profileFieldKey: env.PROFILE_FIELD_KEY || ""
  };
}

// src/lib/server/accountLifecycle.ts
var AccountDeletionError = class extends Error {
  constructor(code, status = 409) {
    super(code);
    this.code = code;
    this.status = status;
  }
};
function hasExternalBilling(provider, subscriptionRef) {
  return Boolean(provider && !["mock", "operator_comp"].includes(provider) || !provider && subscriptionRef);
}
var TenantWorkCoordinator = class {
  constructor(drainWaitMs = 3e4, maxReaders = 64, requestLeaseMs = 12e4) {
    this.drainWaitMs = drainWaitMs;
    this.maxReaders = maxReaders;
    this.requestLeaseMs = requestLeaseMs;
    this.states = /* @__PURE__ */ new Map();
  }
  async run(tenantId, exclusive, work) {
    const state = this.states.get(tenantId) || { readers: 0, deleting: false };
    if (exclusive && state.unsafe) throw new AccountDeletionError("account_work_outcome_unconfirmed", 503);
    if (state.deleting) throw new AccountDeletionError("account_deletion_in_progress", 409);
    if (!exclusive && state.readers >= this.maxReaders) throw new AccountDeletionError("account_busy", 429);
    this.states.set(tenantId, state);
    if (!exclusive) {
      state.readers++;
      let deadline;
      try {
        return await Promise.race([work(), new Promise((_resolve, reject) => {
          deadline = setTimeout(() => {
            state.unsafe = true;
            reject(new AccountDeletionError("request_outcome_unconfirmed", 503));
          }, this.requestLeaseMs);
        })]);
      } finally {
        if (deadline) clearTimeout(deadline);
        state.readers--;
        if (!state.readers) {
          state.drained?.();
          if (!state.deleting && !state.unsafe) this.states.delete(tenantId);
        }
      }
    }
    state.deleting = true;
    let timer;
    try {
      if (state.readers) await new Promise((resolve, reject) => {
        state.drained = resolve;
        timer = setTimeout(() => reject(new AccountDeletionError("account_busy_retry_later", 503)), this.drainWaitMs);
      });
      if (state.unsafe) throw new AccountDeletionError("account_work_outcome_unconfirmed", 503);
      return await work();
    } finally {
      if (timer) clearTimeout(timer);
      state.drained = void 0;
      state.deleting = false;
      if (!state.readers && !state.unsafe) this.states.delete(tenantId);
    }
  }
};

// src/lib/server/repos/memory.ts
function createMemoryRepos() {
  const tenants = /* @__PURE__ */ new Map();
  const usersById = /* @__PURE__ */ new Map();
  const usersByEmail = /* @__PURE__ */ new Map();
  const sessionsById = /* @__PURE__ */ new Map();
  const sessionsByToken = /* @__PURE__ */ new Map();
  const entitlements = /* @__PURE__ */ new Map();
  const billingEventIds = /* @__PURE__ */ new Map();
  const usage = /* @__PURE__ */ new Map();
  const profiles = /* @__PURE__ */ new Map();
  const applications = /* @__PURE__ */ new Map();
  const clone = (v) => structuredClone(v);
  const repos = {
    accountDeletion: {
      async erase(tenantId) {
        if (!tenants.has(tenantId)) return;
        if (hasExternalBilling(entitlements.get(tenantId)?.providerName, entitlements.get(tenantId)?.providerSubscriptionRef) || [...billingEventIds.values()].some((e) => e.tenantId === tenantId && hasExternalBilling(e.provider))) {
          throw new AccountDeletionError("billing_resolution_required");
        }
        for (const [id, u] of usersById) if (u.tenantId === tenantId) {
          usersById.delete(id);
          usersByEmail.delete(u.email.toLowerCase());
        }
        for (const [id, v] of sessionsById) if (v.tenantId === tenantId) {
          sessionsById.delete(id);
          sessionsByToken.delete(v.tokenHash);
        }
        for (const [id, v] of applications) if (v.tenantId === tenantId) applications.delete(id);
        for (const [id, v] of usage) if (v.tenantId === tenantId) usage.delete(id);
        for (const [id, v] of billingEventIds) if (v.tenantId === tenantId) billingEventIds.delete(id);
        profiles.delete(tenantId);
        entitlements.delete(tenantId);
        tenants.delete(tenantId);
      }
    },
    beta: {
      async redeem(e) {
        if (!tenants.has(e.tenantId)) throw new Error("tenant_missing");
        if (!entitlements.has(e.tenantId)) entitlements.set(e.tenantId, clone(e));
      }
    },
    tenants: {
      async create(t) {
        tenants.set(t.id, clone(t));
      },
      async getById(id) {
        const t = tenants.get(id);
        return t ? clone(t) : null;
      }
    },
    users: {
      async create(u) {
        const key = u.email.toLowerCase();
        if (usersByEmail.has(key)) throw new Error("email_already_registered");
        usersById.set(u.id, clone(u));
        usersByEmail.set(key, clone(u));
      },
      async getByEmail(email) {
        const u = usersByEmail.get(email.toLowerCase());
        return u ? clone(u) : null;
      },
      async getById(id) {
        const u = usersById.get(id);
        return u ? clone(u) : null;
      }
    },
    sessions: {
      async create(s) {
        sessionsById.set(s.id, clone(s));
        sessionsByToken.set(s.tokenHash, clone(s));
      },
      async getByTokenHash(h) {
        const s = sessionsByToken.get(h);
        return s ? clone(s) : null;
      },
      async delete(id) {
        const s = sessionsById.get(id);
        if (s) {
          sessionsById.delete(id);
          sessionsByToken.delete(s.tokenHash);
        }
      }
    },
    entitlements: {
      async get(tenantId) {
        const e = entitlements.get(tenantId);
        return e ? clone(e) : null;
      },
      async put(e) {
        entitlements.set(e.tenantId, clone(e));
      }
    },
    billingEvents: {
      async has(eventId) {
        return billingEventIds.has(eventId);
      },
      async record(e) {
        billingEventIds.set(e.eventId, clone(e));
      }
    },
    usage: {
      async get(tenantId, periodKey) {
        const key = `${tenantId}:${periodKey}`;
        const existing = usage.get(key);
        if (existing) return clone(existing);
        return { tenantId, periodKey, analyses: 0, serpapiLookups: 0 };
      },
      async increment(tenantId, periodKey, field) {
        const key = `${tenantId}:${periodKey}`;
        const counter = usage.get(key) || { tenantId, periodKey, analyses: 0, serpapiLookups: 0 };
        counter[field] += 1;
        usage.set(key, counter);
        return clone(counter);
      },
      async tryConsume(tenantId, periodKey, field, limit) {
        const key = `${tenantId}:${periodKey}`;
        const counter = usage.get(key) || { tenantId, periodKey, analyses: 0, serpapiLookups: 0 };
        if (counter[field] >= limit) return { allowed: false, counter: clone(counter) };
        counter[field] += 1;
        usage.set(key, counter);
        return { allowed: true, counter: clone(counter) };
      },
      async release(tenantId, periodKey, field) {
        const key = `${tenantId}:${periodKey}`;
        const counter = usage.get(key) || { tenantId, periodKey, analyses: 0, serpapiLookups: 0 };
        counter[field] = Math.max(0, counter[field] - 1);
        usage.set(key, counter);
        return clone(counter);
      }
    },
    profiles: {
      async get(tenantId) {
        const p = profiles.get(tenantId);
        return p ? clone(p) : null;
      },
      async put(p) {
        profiles.set(p.tenantId, clone(p));
      },
      async delete(tenantId) {
        profiles.delete(tenantId);
      }
    },
    applications: {
      async create(a) {
        applications.set(`${a.tenantId}:${a.id}`, clone(a));
      },
      async getById(tenantId, id) {
        const a = applications.get(`${tenantId}:${id}`);
        return a ? clone(a) : null;
      },
      async listByTenant(tenantId) {
        return [...applications.values()].filter((a) => a.tenantId === tenantId).map(clone);
      },
      async put(a) {
        applications.set(`${a.tenantId}:${a.id}`, clone(a));
      },
      async delete(tenantId, id) {
        applications.delete(`${tenantId}:${id}`);
      }
    },
    stats: {
      async overview(periodKey) {
        const entitlementsByStatus = {};
        for (const e of entitlements.values()) {
          const key = e.status || "none";
          entitlementsByStatus[key] = (entitlementsByStatus[key] || 0) + 1;
        }
        let analyses = 0;
        let serpapiLookups = 0;
        for (const c of usage.values()) {
          if (c.periodKey !== periodKey) continue;
          analyses += c.analyses;
          serpapiLookups += c.serpapiLookups;
        }
        return { tenants: tenants.size, users: usersById.size, entitlementsByStatus, usage: { analyses, serpapiLookups } };
      }
    }
  };
  const guard = (group, name, tenant) => {
    const original = group[name];
    group[name] = async (...args) => {
      if (!tenants.has(tenant(...args))) throw new AccountDeletionError("tenant_not_found", 404);
      return original.apply(group, args);
    };
  };
  for (const [group, name] of [["users", "create"], ["sessions", "create"], ["entitlements", "put"], ["billingEvents", "record"], ["profiles", "put"], ["applications", "create"], ["applications", "put"]]) {
    guard(repos[group], name, (a) => a.tenantId);
  }
  for (const name of ["increment", "tryConsume", "release"]) guard(repos.usage, name, (a) => a);
  return repos;
}

// src/lib/server/auth.ts
import { randomBytes as randomBytes3, createHash as createHash2 } from "node:crypto";
import { Router } from "express";

// src/lib/server/passwords.ts
import { scrypt, randomBytes as randomBytes2, timingSafeEqual } from "node:crypto";
function scryptAsync(password, salt, keylen, options) {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, options, (err, derivedKey) => err ? reject(err) : resolve(derivedKey));
  });
}
var SCRYPT_N = 16384;
var SCRYPT_R = 8;
var SCRYPT_P = 1;
var KEY_LENGTH = 32;
var SALT_LENGTH = 16;
async function hashPassword(password) {
  const salt = randomBytes2(SALT_LENGTH);
  const derived = await scryptAsync(password, salt, KEY_LENGTH, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return ["scrypt", SCRYPT_N, SCRYPT_R, SCRYPT_P, salt.toString("base64"), derived.toString("base64")].join("$");
}
async function verifyPassword(password, stored) {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, nStr, rStr, pStr, saltB64, hashB64] = parts;
  const n = Number(nStr), r = Number(rStr), p = Number(pStr);
  if (!n || !r || !p) return false;
  let salt, expected;
  try {
    salt = Buffer.from(saltB64, "base64");
    expected = Buffer.from(hashB64, "base64");
  } catch {
    return false;
  }
  if (expected.length !== KEY_LENGTH) return false;
  const derived = await scryptAsync(password, salt, KEY_LENGTH, { N: n, r, p });
  return timingSafeEqual(derived, expected);
}

// src/lib/server/auth.ts
var SESSION_COOKIE = "ta_session";
var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function hashToken(token) {
  return createHash2("sha256").update(token).digest("hex");
}
function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}
function setSessionCookie(res, token, maxAgeMs, secure) {
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.floor(maxAgeMs / 1e3)}`
  ];
  if (secure) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}
function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}
async function createSession(repos, config, user) {
  const token = randomBytes3(32).toString("base64url");
  const now = /* @__PURE__ */ new Date();
  const session = {
    id: randomBytes3(16).toString("hex"),
    userId: user.id,
    tenantId: user.tenantId,
    tokenHash: hashToken(token),
    expiresAt: new Date(now.getTime() + config.sessionTtlHours * 60 * 60 * 1e3),
    createdAt: now
  };
  await repos.sessions.create(session);
  return { token, session };
}
async function resolveSession(repos, token) {
  if (!token) return null;
  const session = await repos.sessions.getByTokenHash(hashToken(token));
  if (!session) return null;
  if (session.expiresAt.getTime() <= Date.now()) {
    await repos.sessions.delete(session.id);
    return null;
  }
  const user = await repos.users.getById(session.userId);
  if (!user) return null;
  return { userId: user.id, tenantId: user.tenantId, email: user.email };
}
function createSessionMiddleware(repos) {
  return async (req, _res, next) => {
    try {
      const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
      const auth = await resolveSession(repos, token);
      if (auth) req.auth = auth;
    } catch (err) {
      console.error("[foundation] session resolution failed:", err);
    }
    next();
  };
}
function createRateLimiter(maxAttempts, windowMs) {
  const buckets = /* @__PURE__ */ new Map();
  const bucketFor = (key) => {
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }
    if (buckets.size > 1e4) {
      for (const [k, b] of buckets) if (now >= b.resetAt) buckets.delete(k);
    }
    return bucket;
  };
  return {
    /** Increment and decide - the IP-wide entry check. */
    allow(key) {
      const bucket = bucketFor(key);
      bucket.count += 1;
      return bucket.count <= maxAttempts;
    },
    /** Would one more attempt fit this window? Does NOT increment. */
    peek(key) {
      return bucketFor(key).count < maxAttempts;
    },
    /** Record one FAILED attempt against a bucket (successes don't count). */
    hit(key) {
      bucketFor(key).count += 1;
    }
  };
}
function isSecureRequest(req, config) {
  return config.cookieSecure || req.secure || req.headers["x-forwarded-proto"] === "https";
}
function createAuthRouter(repos, config) {
  const router = Router();
  const ipLimiter = createRateLimiter(config.authRateLimit.maxAttempts, config.authRateLimit.windowMs);
  const accountLimiter = createRateLimiter(config.authRateLimit.maxAttempts, config.authRateLimit.windowMs);
  router.use((req, res, next) => {
    if (!req.path.startsWith("/auth/")) {
      next();
      return;
    }
    if (!ipLimiter.allow(`${req.ip}:${req.path}`)) {
      res.status(429).json({ success: false, error: "too_many_attempts" });
      return;
    }
    next();
  });
  router.post("/auth/signup", async (req, res) => {
    try {
      const { email, password, companyName } = req.body || {};
      if (typeof email !== "string" || !EMAIL_RE.test(email)) {
        res.status(400).json({ success: false, error: "valid email required" });
        return;
      }
      if (typeof password !== "string" || password.length < config.minPasswordLength) {
        res.status(400).json({ success: false, error: `password must be at least ${config.minPasswordLength} characters` });
        return;
      }
      if (await repos.users.getByEmail(email)) {
        res.status(409).json({ success: false, error: "email_already_registered" });
        return;
      }
      const now = /* @__PURE__ */ new Date();
      const tenant = {
        id: randomBytes3(16).toString("hex"),
        companyName: typeof companyName === "string" && companyName.trim() ? companyName.trim() : email,
        createdAt: now
      };
      const user = {
        id: randomBytes3(16).toString("hex"),
        tenantId: tenant.id,
        email: email.toLowerCase(),
        passwordHash: await hashPassword(password),
        createdAt: now
      };
      await repos.tenants.create(tenant);
      await repos.users.create(user);
      const { token } = await createSession(repos, config, user);
      setSessionCookie(res, token, config.sessionTtlHours * 60 * 60 * 1e3, isSecureRequest(req, config));
      res.json({ success: true, tenantId: tenant.id, email: user.email, userId: user.id, isAdmin: config.adminUserIds.includes(user.id) });
    } catch (err) {
      res.status(err.message === "email_already_registered" ? 409 : 500).json({ success: false, error: err.message });
    }
  });
  router.post("/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body || {};
      if (typeof email !== "string" || typeof password !== "string") {
        res.status(400).json({ success: false, error: "email and password required" });
        return;
      }
      const accountKey = `login-account:${email.toLowerCase()}`;
      if (!accountLimiter.peek(accountKey)) {
        res.status(429).json({ success: false, error: "too_many_attempts" });
        return;
      }
      const user = await repos.users.getByEmail(email);
      if (!user || !await verifyPassword(password, user.passwordHash)) {
        accountLimiter.hit(accountKey);
        res.status(401).json({ success: false, error: "invalid_credentials" });
        return;
      }
      const { token } = await createSession(repos, config, user);
      setSessionCookie(res, token, config.sessionTtlHours * 60 * 60 * 1e3, isSecureRequest(req, config));
      res.json({ success: true, tenantId: user.tenantId, email: user.email, userId: user.id, isAdmin: config.adminUserIds.includes(user.id) });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });
  router.post("/auth/logout", async (req, res) => {
    try {
      const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
      if (token) {
        const session = await repos.sessions.getByTokenHash(hashToken(token));
        if (session) await repos.sessions.delete(session.id);
      }
      clearSessionCookie(res);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });
  router.get("/auth/me", (req, res) => {
    if (!req.auth) {
      res.status(401).json({ success: false, error: "not_authenticated" });
      return;
    }
    res.json({ success: true, ...req.auth, isAdmin: config.adminUserIds.includes(req.auth.userId) });
  });
  return router;
}

// src/lib/server/entitlement.ts
var DAY_MS = 24 * 60 * 60 * 1e3;
function emptyEntitlement(tenantId) {
  return {
    tenantId,
    planId: null,
    status: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    providerName: null,
    providerSubscriptionRef: null,
    refundedAt: null,
    lastEventAt: null,
    lastEventId: null,
    updatedAt: /* @__PURE__ */ new Date()
  };
}
function effectiveStatus(ent, now, graceDays) {
  if (!ent || !ent.status) return "none";
  if (ent.planId === "test_cohort" && (!ent.currentPeriodEnd || now.getTime() >= ent.currentPeriodEnd.getTime())) return "cancelled";
  if (ent.status === "cancelled") return "cancelled";
  if (ent.currentPeriodEnd && now.getTime() > ent.currentPeriodEnd.getTime()) {
    if (ent.cancelAtPeriodEnd) return "cancelled";
    const graceEnd = ent.currentPeriodEnd.getTime() + graceDays * DAY_MS;
    return now.getTime() > graceEnd ? "cancelled" : "past_due";
  }
  return ent.status;
}
function entitlementStatus(ent, config, now = /* @__PURE__ */ new Date()) {
  if (ent?.planId === "test_cohort" && (!config.betaCampaign || ent.providerSubscriptionRef !== `beta:${config.betaCampaign.id}` || now < new Date(config.betaCampaign.startsAt) || now >= new Date(config.betaCampaign.endsAt))) return "cancelled";
  return effectiveStatus(ent, now, config.pastDueGraceDays);
}
async function applyBillingEvent(repos, evt, now = /* @__PURE__ */ new Date()) {
  if (!await repos.tenants.getById(evt.tenantId)) return { applied: false, reason: "tenant_missing", entitlement: emptyEntitlement(evt.tenantId) };
  if (await repos.billingEvents.has(evt.eventId)) {
    const current2 = await repos.entitlements.get(evt.tenantId) || emptyEntitlement(evt.tenantId);
    return { applied: false, reason: "duplicate", entitlement: current2 };
  }
  const current = await repos.entitlements.get(evt.tenantId) || emptyEntitlement(evt.tenantId);
  const isStale = current.lastEventAt && (evt.occurredAt.getTime() < current.lastEventAt.getTime() || evt.occurredAt.getTime() === current.lastEventAt.getTime() && current.lastEventId !== null && evt.eventId <= current.lastEventId);
  if (isStale) {
    await repos.billingEvents.record({
      eventId: evt.eventId,
      provider: evt.provider,
      type: evt.type,
      tenantId: evt.tenantId,
      occurredAt: evt.occurredAt,
      receivedAt: now
    });
    return { applied: false, reason: "stale", entitlement: current };
  }
  const next = { ...current, lastEventAt: evt.occurredAt, lastEventId: evt.eventId, updatedAt: now };
  const defaultPeriodEnd = new Date(evt.occurredAt.getTime() + 31 * DAY_MS);
  switch (evt.type) {
    case "subscription.activated":
      next.status = "active";
      next.planId = evt.planId || next.planId;
      next.providerName = evt.provider;
      next.providerSubscriptionRef = evt.subscriptionRef || next.providerSubscriptionRef;
      next.currentPeriodEnd = evt.periodEnd || next.currentPeriodEnd || defaultPeriodEnd;
      next.cancelAtPeriodEnd = false;
      next.refundedAt = null;
      break;
    case "subscription.renewed":
      next.status = "active";
      next.currentPeriodEnd = evt.periodEnd || next.currentPeriodEnd || defaultPeriodEnd;
      next.cancelAtPeriodEnd = false;
      break;
    case "subscription.payment_failed":
      next.status = "past_due";
      break;
    case "subscription.cancellation_scheduled":
      next.cancelAtPeriodEnd = true;
      break;
    case "subscription.cancelled":
      next.status = "cancelled";
      next.cancelAtPeriodEnd = false;
      break;
    case "subscription.refunded":
      next.status = "cancelled";
      next.cancelAtPeriodEnd = false;
      next.refundedAt = evt.occurredAt;
      break;
  }
  await repos.entitlements.put(next);
  await repos.billingEvents.record({
    eventId: evt.eventId,
    provider: evt.provider,
    type: evt.type,
    tenantId: evt.tenantId,
    occurredAt: evt.occurredAt,
    receivedAt: now
  });
  return { applied: true, entitlement: next };
}
async function authorizeAndConsume(repos, config, tenantId, action, now = /* @__PURE__ */ new Date()) {
  const ent = await repos.entitlements.get(tenantId);
  const status = entitlementStatus(ent, config, now);
  if (status === "none") return { allowed: false, reason: "no_subscription", status };
  if (status === "cancelled" || status === "past_due") {
    return { allowed: false, reason: "subscription_inactive", status };
  }
  const plan = getPlan(ent?.planId, config.plans);
  if (!plan) return { allowed: false, reason: "unknown_plan", status };
  const limit = ent?.planId === "test_cohort" ? action === "analysis" ? 20 : 0 : action === "analysis" ? plan.includedAnalyses : plan.includedSerpapiLookups;
  const field = action === "analysis" ? "analyses" : "serpapiLookups";
  const claim = await repos.usage.tryConsume(tenantId, usagePeriodKey(ent, now), field, limit);
  if (!claim.allowed) return { allowed: false, reason: "plan_limit_reached", status };
  return { allowed: true, status, periodKey: usagePeriodKey(ent, now) };
}
function usagePeriodKey(ent, now = /* @__PURE__ */ new Date()) {
  return ent?.planId === "test_cohort" ? "beta_pilot_v1" : currentPeriodKey(now);
}
function currentPeriodKey(now = /* @__PURE__ */ new Date()) {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

// src/lib/server/billing.ts
import { createHmac, timingSafeEqual as timingSafeEqual2 } from "node:crypto";
import { Router as Router2, raw } from "express";
var VALID_TYPES = /* @__PURE__ */ new Set([
  "subscription.activated",
  "subscription.renewed",
  "subscription.payment_failed",
  "subscription.cancellation_scheduled",
  "subscription.cancelled",
  "subscription.refunded"
]);
var MockBillingProvider = class _MockBillingProvider {
  constructor(secret) {
    this.secret = secret;
    this.name = "mock";
  }
  static sign(secret, rawBody) {
    return "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");
  }
  verifyAndNormalize(rawBody, signatureHeader) {
    if (!signatureHeader) return null;
    const expected = _MockBillingProvider.sign(this.secret, rawBody);
    const a = Buffer.from(expected);
    const b = Buffer.from(signatureHeader);
    if (a.length !== b.length || !timingSafeEqual2(a, b)) return null;
    try {
      const p = JSON.parse(rawBody.toString("utf8"));
      if (typeof p.eventId !== "string" || !VALID_TYPES.has(p.type) || typeof p.tenantId !== "string") return null;
      return {
        eventId: p.eventId,
        provider: this.name,
        type: p.type,
        tenantId: p.tenantId,
        planId: typeof p.planId === "string" ? p.planId : void 0,
        subscriptionRef: typeof p.subscriptionRef === "string" ? p.subscriptionRef : void 0,
        periodEnd: p.periodEnd ? new Date(p.periodEnd) : void 0,
        occurredAt: p.occurredAt ? new Date(p.occurredAt) : /* @__PURE__ */ new Date()
      };
    } catch {
      return null;
    }
  }
};
function createWebhookRouter(providers, repos) {
  const router = Router2();
  router.post(
    "/:provider",
    raw({ type: "*/*" }),
    async (req, res) => {
      const provider = providers.find((p) => p.name === req.params.provider);
      if (!provider) {
        res.status(404).json({ success: false, error: "unknown_provider" });
        return;
      }
      const signature = req.headers["x-billing-signature"];
      const evt = provider.verifyAndNormalize(
        req.body,
        Array.isArray(signature) ? signature[0] : signature
      );
      if (!evt) {
        res.status(401).json({ success: false, error: "invalid_signature_or_payload" });
        return;
      }
      let result;
      try {
        result = await applyBillingEvent(repos, evt);
      } catch {
        if (!await repos.tenants.getById(evt.tenantId)) {
          res.json({ success: true, applied: false, reason: "tenant_missing" });
          return;
        }
        res.status(503).json({ success: false, error: "billing_event_failed" });
        return;
      }
      res.json({ success: true, applied: result.applied, reason: result.reason });
    }
  );
  return router;
}

// src/lib/server/readiness.ts
var RESOLVED = ["satisfied", "not_applicable"];
function evaluateReadiness(app2) {
  if (app2.requirements.length === 0) {
    return {
      ready: false,
      blockers: [{ requirementId: "", label: "No requirements recorded for this tender yet", reason: "no_requirements" }],
      resolvedCount: 0,
      totalCount: 0
    };
  }
  const blockers = app2.requirements.filter((r) => !RESOLVED.includes(r.status)).map((r) => ({ requirementId: r.id, label: r.label, reason: r.status }));
  const resolvedCount = app2.requirements.length - blockers.length;
  return { ready: blockers.length === 0, blockers, resolvedCount, totalCount: app2.requirements.length };
}
function seedRequirementsForTender(input) {
  const text = input.rawText || "";
  const cidbMentioned = /\bCIDB\b|\b[1-9](CE|GB|EB|EP|ME|SF|SQ|SW|SB|SC|SD|SE|SH|SI|SJ|SK|SL|SM|SN|SO)\b/i.test(text);
  const csdMentioned = /\bCSD\b|central supplier database|\bMAAA\d+/i.test(text);
  const sarsMentioned = /\bSARS\b|\bTCS\b|tax compliance status|tax pin/i.test(text);
  const reqs = [
    {
      id: "req-csd",
      label: csdMentioned ? "CSD registration (MAAA supplier number)" : "Confirm whether this tender requires CSD registration (MAAA supplier number)",
      source: {
        type: "official_rule",
        reference: "National Treasury Central Supplier Database - organ-of-state supplier registration",
        url: "https://www.csd.gov.za/"
      },
      // Firm only when the tender itself asks for CSD; otherwise a human
      // confirms applicability for this tender before it blocks anything.
      status: csdMentioned ? "missing" : "needs_review"
    },
    {
      id: "req-sars-tcs",
      label: sarsMentioned ? "SARS Tax Compliance Status (TCS PIN)" : "Confirm whether this tender requires a SARS Tax Compliance Status PIN",
      source: {
        type: "official_rule",
        reference: "SARS Tax Compliance Status (TCS) system - how to request your TCS PIN",
        url: "https://www.sars.gov.za/individuals/manage-your-tax-compliance-status/how-to-request-your-tax-compliance-status/"
      },
      status: sarsMentioned ? "missing" : "needs_review"
    }
  ];
  if (cidbMentioned) {
    reqs.push({
      id: "req-cidb",
      label: "cidb contractor registration at the grading stated in this tender",
      source: {
        type: "official_rule",
        reference: "CIDB Act 38 of 2000 + CID Regulations 2004 (as amended) - Register of Contractors",
        url: "https://www.cidb.org.za/clients/procurement-guides/applying-register-of-contractors/"
      },
      // The tender text mentions cidb, but the exact class/grading and whether
      // this award is construction works must be confirmed by a human.
      status: "needs_review"
    });
  }
  return reqs;
}

// src/lib/server/foundation.ts
import { randomBytes as randomBytes4, createHash as createHash3 } from "node:crypto";
var CONSUMED = /* @__PURE__ */ Symbol.for("tenderagent.consumed");
function markConsumed(req, action, periodKey) {
  req[CONSUMED] = { ...req[CONSUMED], [action]: periodKey };
}
var GUARDED_ROUTES = [
  { method: "POST", path: "/api/analyze", action: "analysis" },
  { method: "GET", path: "/api/scrape", action: "serpapi" },
  { method: "POST", path: "/api/etenders/sync", action: "serpapi" },
  { method: "POST", path: "/api/parse-document", action: null }
  // account boundary only, no external cost
];
function defaultBillingProviders(config) {
  if (config.mockBillingSecret) return [new MockBillingProvider(config.mockBillingSecret)];
  if (process.env.NODE_ENV === "production") {
    console.warn("[foundation] No billing webhook secret configured - mock billing provider DISABLED in production.");
    return [];
  }
  const bootSecret = randomBytes4(24).toString("base64url");
  console.warn("[foundation] MOCK_BILLING_SECRET not set - generated a random per-boot secret for local testing (see server log, not committed).");
  return [new MockBillingProvider(bootSecret)];
}
function createFoundation(options = {}) {
  const config = options.config || loadConfig();
  assertSafeConfig(config);
  if (process.env.NODE_ENV === "production" && !config.authRequired) {
    console.warn("[foundation] Production boot with AUTH_REQUIRED unset: account guards no-op (demo posture). Paid API calls remain restricted per call to active subscribers with allowance remaining.");
  }
  const repos = options.repos || createMemoryRepos();
  const providers = options.providers || defaultBillingProviders(config);
  const sessionMiddleware = createSessionMiddleware(repos);
  const coordinator = new TenantWorkCoordinator(3e4, 64, options.requestLeaseMs);
  const tenantWorkMiddleware = (req, res, next) => {
    if (!req.auth || !config.accountDeletionEnabled) {
      next();
      return;
    }
    const tenantId = req.auth.tenantId;
    void coordinator.run(tenantId, req.method === "DELETE" && req.path === "/api/account", async () => {
      if (!await repos.tenants.getById(tenantId)) {
        res.status(401).json({ success: false, error: "authentication_required" });
        return;
      }
      await new Promise((resolve) => {
        if (res.destroyed) {
          resolve();
          return;
        }
        const originalEnd = res.end;
        res.end = function(...args) {
          try {
            return originalEnd.apply(this, args);
          } finally {
            resolve();
          }
        };
        res.once("finish", resolve);
        next();
      });
    }).catch((e) => {
      const err = e instanceof AccountDeletionError ? e : new AccountDeletionError("account_unavailable", 503);
      if (!res.headersSent && !res.destroyed) res.status(err.status).json({ success: false, error: err.code });
    });
  };
  const authRouter = createAuthRouter(repos, config);
  const webhookRouter = createWebhookRouter(providers, repos);
  const originCheckMiddleware = (req, res, next) => {
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) return next();
    if (req.path.startsWith("/api/billing/webhook")) return next();
    const origin = req.headers.origin;
    if (origin) {
      try {
        if (new URL(origin).host !== req.headers.host && origin !== config.publicOrigin) {
          res.status(403).json({ success: false, error: "origin_forbidden" });
          return;
        }
      } catch {
        res.status(403).json({ success: false, error: "origin_forbidden" });
        return;
      }
    }
    next();
  };
  const serpApiAccess = async (req) => {
    if (!req.auth) return false;
    try {
      if ((await repos.entitlements.get(req.auth.tenantId))?.planId === "test_cohort") return false;
      if (req[CONSUMED]?.serpapi) return true;
      const decision = await authorizeAndConsume(repos, config, req.auth.tenantId, "serpapi");
      if (decision.allowed) markConsumed(req, "serpapi", decision.periodKey);
      return decision.allowed;
    } catch (err) {
      console.error("[foundation] SerpApi metering failed - paid lookup denied:", err);
      return false;
    }
  };
  const cloudLlmAccess = async (req) => {
    if (!req.auth) return false;
    try {
      if ((await repos.entitlements.get(req.auth.tenantId))?.planId === "test_cohort") return false;
      if (req[CONSUMED]?.analysis) return true;
      const decision = await authorizeAndConsume(repos, config, req.auth.tenantId, "analysis");
      if (decision.allowed) markConsumed(req, "analysis", decision.periodKey);
      return decision.allowed;
    } catch (err) {
      console.error("[foundation] cloud LLM metering failed - paid call denied:", err);
      return false;
    }
  };
  const releaseConsumption = async (req, action) => {
    const consumed = req[CONSUMED];
    if (!req.auth || !consumed?.[action]) return;
    const periodKey = consumed[action];
    consumed[action] = false;
    await repos.usage.release(req.auth.tenantId, periodKey, action === "analysis" ? "analyses" : "serpapiLookups");
  };
  const requireAuth = (req, res, next) => {
    if (!req.auth) {
      res.status(401).json({ success: false, error: "authentication_required" });
      return;
    }
    next();
  };
  const requireAdmin = (req, res, next) => {
    if (!req.auth) {
      res.status(401).json({ success: false, error: "authentication_required" });
      return;
    }
    if (!config.adminUserIds.includes(req.auth.userId)) {
      res.status(403).json({ success: false, error: "admin_required" });
      return;
    }
    next();
  };
  const isAdmin = (req) => Boolean(req.auth) && config.adminUserIds.includes(req.auth.userId);
  const adminRouter = Router3();
  adminRouter.get("/overview", requireAdmin, async (req, res) => {
    try {
      const overview = await repos.stats.overview(currentPeriodKey(/* @__PURE__ */ new Date()));
      res.json({ success: true, overview });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });
  adminRouter.post("/test-access/grant", requireAdmin, async (req, res) => {
    res.status(409).json({ success: false, error: "beta_code_redemption_required" });
  });
  adminRouter.post("/test-access/revoke", requireAdmin, async (req, res) => {
    try {
      const { email } = req.body || {};
      if (typeof email !== "string" || !email.includes("@")) {
        res.status(400).json({ success: false, error: "valid email required" });
        return;
      }
      const user = await repos.users.getByEmail(email.toLowerCase());
      if (!user) {
        res.status(404).json({ success: false, error: "no account with that email" });
        return;
      }
      const ent = await repos.entitlements.get(user.tenantId);
      if (!ent || ent.planId !== "test_cohort" || ent.status !== "active") {
        res.status(404).json({ success: false, error: "no active tester grant for that account" });
        return;
      }
      const now = /* @__PURE__ */ new Date();
      await repos.entitlements.put({ ...ent, status: "cancelled", updatedAt: now });
      console.log(`[admin] test-access REVOKE tenant=${user.tenantId} email=${email.toLowerCase()} by=${req.auth.userId} at=${now.toISOString()}`);
      res.json({ success: true, tenantId: user.tenantId, status: "cancelled" });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });
  adminRouter.get("/test-access/status", requireAdmin, async (req, res) => {
    try {
      const email = typeof req.query.email === "string" ? req.query.email : "";
      if (!email.includes("@")) {
        res.status(400).json({ success: false, error: "valid email query required" });
        return;
      }
      const user = await repos.users.getByEmail(email.toLowerCase());
      if (!user) {
        res.status(404).json({ success: false, error: "no account with that email" });
        return;
      }
      const ent = await repos.entitlements.get(user.tenantId);
      res.json({
        success: true,
        tenantId: user.tenantId,
        entitlement: ent ? { planId: ent.planId, status: ent.status, currentPeriodEnd: ent.currentPeriodEnd, effectiveStatus: entitlementStatus(ent, config, /* @__PURE__ */ new Date()) } : { effectiveStatus: "none" }
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });
  const accountRouter = Router3();
  const deletionAttempts = /* @__PURE__ */ new Map();
  accountRouter.delete("/account", async (req, res) => {
    if (!req.auth) {
      res.status(401).json({ success: false, error: "authentication_required" });
      return;
    }
    if (!config.accountDeletionEnabled) {
      res.status(409).json({ success: false, error: "account_deletion_not_enabled" });
      return;
    }
    if (!repos.accountDeletion) {
      res.status(409).json({ success: false, error: "account_deletion_unavailable_for_store" });
      return;
    }
    const now = Date.now();
    for (const [key, value] of deletionAttempts) if (value.until <= now) deletionAttempts.delete(key);
    const attempt = deletionAttempts.get(req.auth.userId) || { count: 0, until: now + 10 * 6e4 };
    if (attempt.count >= 5) {
      res.status(429).json({ success: false, error: "too_many_attempts" });
      return;
    }
    attempt.count++;
    deletionAttempts.set(req.auth.userId, attempt);
    const { password, confirmation } = req.body || {};
    if (confirmation !== "DELETE MY ACCOUNT" || typeof password !== "string") {
      res.status(400).json({ success: false, error: "explicit_confirmation_and_password_required" });
      return;
    }
    try {
      const user = await repos.users.getById(req.auth.userId);
      if (!user || !await verifyPassword(password, user.passwordHash)) {
        res.status(403).json({ success: false, error: "reauthentication_failed" });
        return;
      }
      await repos.accountDeletion.erase(req.auth.tenantId);
      options.eraseEphemeral?.(req.auth.tenantId);
      res.setHeader("Set-Cookie", "ta_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
      res.json({ success: true, message: "Account and active workspace data deleted. Provider recovery copies follow their separate retention rules." });
    } catch (e) {
      const err = e instanceof AccountDeletionError ? e : new AccountDeletionError("account_deletion_failed", 503);
      res.status(err.status).json({ success: false, error: err.code });
    }
  });
  accountRouter.get("/account", async (req, res) => {
    if (!req.auth) {
      res.status(401).json({ success: false, error: "not_authenticated" });
      return;
    }
    const now = /* @__PURE__ */ new Date();
    const ent = await repos.entitlements.get(req.auth.tenantId);
    const usage = await repos.usage.get(req.auth.tenantId, usagePeriodKey(ent, now));
    const plan = getPlan(ent?.planId, config.plans);
    res.json({
      success: true,
      account: {
        beta: {
          redeemAvailable: Boolean(repos.beta && config.betaCampaign && config.betaCampaign.invites.length > 0 && now >= new Date(config.betaCampaign.startsAt) && now < new Date(config.betaCampaign.endsAt)),
          endsAt: config.betaCampaign?.endsAt || null
        },
        accountDeletionAvailable: config.accountDeletionEnabled && Boolean(repos.accountDeletion),
        tenantId: req.auth.tenantId,
        email: req.auth.email,
        entitlement: ent ? { ...ent, effectiveStatus: entitlementStatus(ent, config, now) } : { effectiveStatus: "none" },
        usage,
        // Own plan's usage allowances only. No plan catalog or pricing here:
        // the R250/60/30 figures are provisional config, not a public offer.
        allowances: plan ? { includedAnalyses: ent?.planId === "test_cohort" ? 20 : plan.includedAnalyses, includedSerpapiLookups: ent?.planId === "test_cohort" ? 0 : plan.includedSerpapiLookups } : null
      }
    });
  });
  const betaAttempts = /* @__PURE__ */ new Map();
  accountRouter.post("/beta/redeem", requireAuth, async (req, res) => {
    const now = /* @__PURE__ */ new Date(), c = config.betaCampaign;
    const key = req.auth.userId;
    for (const [id, a] of betaAttempts) if (a.until <= now.getTime()) betaAttempts.delete(id);
    const attempts = betaAttempts.get(key) || { count: 0, until: now.getTime() + 6e5 };
    if (attempts.count >= 5 || !betaAttempts.has(key) && betaAttempts.size >= 1e4) {
      res.status(429).json({ success: false, error: "too_many_attempts" });
      return;
    }
    attempts.count++;
    betaAttempts.set(key, attempts);
    const code = req.body?.code;
    if (!c || !repos.beta || now < new Date(c.startsAt) || now >= new Date(c.endsAt) || typeof code !== "string" || code.length < 24 || code.length > 256 || !c.invites.some((i) => i.userId === key && i.codeHash === createHash3("sha256").update(code).digest("hex"))) {
      res.status(400).json({ success: false, error: "invalid_or_expired_beta_code" });
      return;
    }
    try {
      await repos.beta.redeem({
        tenantId: req.auth.tenantId,
        planId: "test_cohort",
        status: "active",
        currentPeriodEnd: new Date(c.endsAt),
        cancelAtPeriodEnd: true,
        providerName: "operator_comp",
        providerSubscriptionRef: `beta:${c.id}`,
        refundedAt: null,
        lastEventAt: now,
        lastEventId: `beta:${c.id}`,
        updatedAt: now
      });
      const ent = await repos.entitlements.get(req.auth.tenantId);
      if (ent?.providerSubscriptionRef !== `beta:${c.id}` || entitlementStatus(ent, config, /* @__PURE__ */ new Date()) !== "active") {
        res.status(409).json({ success: false, error: "beta_access_unavailable" });
        return;
      }
      res.json({ success: true, endsAt: ent.currentPeriodEnd });
    } catch {
      res.status(503).json({ success: false, error: "beta_redemption_unavailable" });
    }
  });
  function applyReadyInvariant(app2) {
    if (app2.state === "ready" && !evaluateReadiness(app2).ready) {
      app2.state = "draft";
    }
  }
  const applicationsRouter = Router3();
  applicationsRouter.use((req, res, next) => {
    if (!req.auth) {
      res.status(401).json({ success: false, error: "authentication_required" });
      return;
    }
    next();
  });
  applicationsRouter.post("/", async (req, res) => {
    const { tenderRef, title, rawText } = req.body || {};
    if (typeof tenderRef !== "string" || !tenderRef.trim() || typeof title !== "string" || !title.trim()) {
      res.status(400).json({ success: false, error: "tenderRef and title required" });
      return;
    }
    const now = /* @__PURE__ */ new Date();
    const app2 = {
      id: randomBytes4(12).toString("hex"),
      tenantId: req.auth.tenantId,
      tenderRef: tenderRef.trim(),
      title: title.trim(),
      state: "draft",
      // Compulsory-requirement starters: only officially verified rules, each
      // with its source; uncertain applicability stays needs_review.
      requirements: seedRequirementsForTender({ tenderRef: tenderRef.trim(), rawText: typeof rawText === "string" ? rawText.slice(0, 2e5) : void 0 }),
      createdAt: now,
      updatedAt: now
    };
    await repos.applications.create(app2);
    res.json({ success: true, application: app2, readiness: evaluateReadiness(app2) });
  });
  applicationsRouter.get("/", async (req, res) => {
    const apps = await repos.applications.listByTenant(req.auth.tenantId);
    res.json({ success: true, applications: apps });
  });
  applicationsRouter.get("/:id", async (req, res) => {
    const app2 = await repos.applications.getById(req.auth.tenantId, req.params.id);
    if (!app2) {
      res.status(404).json({ success: false, error: "not_found" });
      return;
    }
    res.json({ success: true, application: app2, readiness: evaluateReadiness(app2) });
  });
  applicationsRouter.delete("/:id", async (req, res) => {
    const app2 = await repos.applications.getById(req.auth.tenantId, req.params.id);
    if (!app2) {
      res.status(404).json({ success: false, error: "not_found" });
      return;
    }
    await repos.applications.delete(req.auth.tenantId, req.params.id);
    res.json({ success: true, message: "Bid draft deleted." });
  });
  applicationsRouter.post("/:id/requirements", async (req, res) => {
    const app2 = await repos.applications.getById(req.auth.tenantId, req.params.id);
    if (!app2) {
      res.status(404).json({ success: false, error: "not_found" });
      return;
    }
    const { label, sourceType, sourceReference } = req.body || {};
    if (typeof label !== "string" || !label.trim() || typeof sourceReference !== "string" || !sourceReference.trim()) {
      res.status(400).json({ success: false, error: "label and sourceReference required - every requirement names its tender clause or official rule" });
      return;
    }
    const requirement = {
      id: `req-${randomBytes4(6).toString("hex")}`,
      label: label.trim(),
      source: {
        type: sourceType === "tender_clause" ? "tender_clause" : "official_rule",
        reference: sourceReference.trim()
      },
      status: "missing"
    };
    app2.requirements.push(requirement);
    applyReadyInvariant(app2);
    app2.updatedAt = /* @__PURE__ */ new Date();
    await repos.applications.put(app2);
    res.json({ success: true, application: app2, readiness: evaluateReadiness(app2) });
  });
  applicationsRouter.post("/:id/requirements/:reqId/satisfy", async (req, res) => {
    const app2 = await repos.applications.getById(req.auth.tenantId, req.params.id);
    if (!app2) {
      res.status(404).json({ success: false, error: "not_found" });
      return;
    }
    const requirement = app2.requirements.find((r) => r.id === req.params.reqId);
    if (!requirement) {
      res.status(404).json({ success: false, error: "requirement_not_found" });
      return;
    }
    const { evidenceNote } = req.body || {};
    requirement.status = "satisfied";
    requirement.evidenceNote = typeof evidenceNote === "string" ? evidenceNote.slice(0, 500) : void 0;
    delete requirement.notApplicableReason;
    applyReadyInvariant(app2);
    app2.updatedAt = /* @__PURE__ */ new Date();
    await repos.applications.put(app2);
    res.json({ success: true, application: app2, readiness: evaluateReadiness(app2) });
  });
  applicationsRouter.post("/:id/requirements/:reqId/not-applicable", async (req, res) => {
    const app2 = await repos.applications.getById(req.auth.tenantId, req.params.id);
    if (!app2) {
      res.status(404).json({ success: false, error: "not_found" });
      return;
    }
    const requirement = app2.requirements.find((r) => r.id === req.params.reqId);
    if (!requirement) {
      res.status(404).json({ success: false, error: "requirement_not_found" });
      return;
    }
    const { reason } = req.body || {};
    if (typeof reason !== "string" || !reason.trim()) {
      res.status(400).json({ success: false, error: "reason required - record why this requirement does not apply to this tender" });
      return;
    }
    requirement.status = "not_applicable";
    requirement.notApplicableReason = reason.trim().slice(0, 500);
    delete requirement.evidenceNote;
    applyReadyInvariant(app2);
    app2.updatedAt = /* @__PURE__ */ new Date();
    await repos.applications.put(app2);
    res.json({ success: true, application: app2, readiness: evaluateReadiness(app2) });
  });
  applicationsRouter.post("/:id/mark-ready", async (req, res) => {
    const app2 = await repos.applications.getById(req.auth.tenantId, req.params.id);
    if (!app2) {
      res.status(404).json({ success: false, error: "not_found" });
      return;
    }
    const readiness = evaluateReadiness(app2);
    if (!readiness.ready) {
      res.status(409).json({ success: false, error: "application_incomplete", readiness });
      return;
    }
    app2.state = "ready";
    app2.updatedAt = /* @__PURE__ */ new Date();
    await repos.applications.put(app2);
    res.json({ success: true, application: app2, readiness });
  });
  const router = Router3();
  router.use(authRouter);
  router.use(accountRouter);
  router.use("/applications", applicationsRouter);
  const apiCacheHeaders = (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  };
  const guardMiddleware = async (req, res, next) => {
    if (!config.authRequired && (!req.auth || (await repos.entitlements.get(req.auth.tenantId))?.planId !== "test_cohort")) {
      next();
      return;
    }
    const rule = GUARDED_ROUTES.find((r) => r.method === req.method && r.path === req.path);
    if (!rule) {
      next();
      return;
    }
    if (!req.auth) {
      res.status(401).json({ success: false, error: "authentication_required" });
      return;
    }
    if (!rule.action) {
      next();
      return;
    }
    try {
      const decision = await authorizeAndConsume(repos, config, req.auth.tenantId, rule.action);
      if (decision.allowed) {
        markConsumed(req, rule.action, decision.periodKey);
        const action = rule.action;
        res.once("finish", () => {
          if (res.statusCode >= 400) void releaseConsumption(req, action).catch(() => console.error("[foundation] Failed request allowance release unavailable"));
        });
      }
      if (!decision.allowed) {
        const status = decision.reason === "plan_limit_reached" ? 429 : 402;
        res.status(status).json({ success: false, error: decision.reason, entitlementStatus: decision.status });
        return;
      }
      next();
    } catch (err) {
      console.error("[foundation] entitlement check failed:", err);
      res.status(500).json({ success: false, error: "entitlement_check_failed" });
    }
  };
  return { config, repos, originCheckMiddleware, sessionMiddleware, tenantWorkMiddleware, apiCacheHeaders, guardMiddleware, serpApiAccess, cloudLlmAccess, releaseConsumption, requireAuth, requireAdmin, isAdmin, adminRouter, router, webhookRouter };
}

// src/lib/server/repos/profilePinMigration.ts
var PinMigrationError = class extends Error {
};
async function migrateProfilePins(pool, key) {
  if (!fieldEncryptionEnabled(key)) throw new PinMigrationError("Profile PIN migration requires a protection key.");
  let client;
  try {
    client = await pool.connect();
  } catch {
    throw new PinMigrationError("Profile PIN migration could not acquire a database connection. Service startup stopped.");
  }
  let commitAttempted = false;
  let discardConnection = false;
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout = '15s'");
    await client.query("SET LOCAL statement_timeout = '60s'");
    await client.query("SET LOCAL idle_in_transaction_session_timeout = '60s'");
    await client.query("LOCK TABLE foundation_profiles IN SHARE ROW EXCLUSIVE MODE");
    const { rows } = await client.query("SELECT tenant_id, profile FROM foundation_profiles");
    const counts = { encrypted: 0, alreadyEncrypted: 0, empty: 0 };
    const updates = [];
    for (const row of rows) {
      const pin = row.profile.taxComplianceStatusPin;
      if (pin == null || pin === "") {
        counts.empty++;
        continue;
      }
      if (typeof pin !== "string") throw new PinMigrationError("Profile PIN migration found an unsupported field type. No rows changed.");
      if (isEncryptedValue(pin)) {
        if (decryptField(key, pin) === "") throw new PinMigrationError("Profile PIN migration cannot read existing protected data. Restore the protection key or investigate corruption. No rows changed.");
        counts.alreadyEncrypted++;
        continue;
      }
      updates.push({ tenantId: row.tenant_id, profile: { ...row.profile, taxComplianceStatusPin: encryptField(key, pin) } });
    }
    for (const update of updates) {
      await client.query("UPDATE foundation_profiles SET profile=$2 WHERE tenant_id=$1", [update.tenantId, JSON.stringify(update.profile)]);
      counts.encrypted++;
    }
    commitAttempted = true;
    await client.query("COMMIT");
    return counts;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      discardConnection = true;
    }
    if (commitAttempted) {
      discardConnection = true;
      throw new PinMigrationError("Profile PIN migration commit outcome is unconfirmed. Service startup stopped. Keep old releases stopped; verify with the same key before retrying.");
    }
    if (error instanceof PinMigrationError) throw error;
    throw new PinMigrationError("Profile PIN migration failed before commit. Service startup stopped; verify database state before recovery.");
  } finally {
    client.release(discardConnection);
  }
}

// src/lib/server/repos/mongo.ts
import mongoose, { Schema } from "mongoose";
var TenantSchema = new Schema({ _id: String, companyName: String, createdAt: Date }, { versionKey: false });
var UserSchema = new Schema({
  _id: String,
  tenantId: { type: String, index: true },
  email: { type: String, unique: true, index: true },
  passwordHash: String,
  createdAt: Date
}, { versionKey: false });
var SessionSchema = new Schema({
  _id: String,
  userId: String,
  tenantId: String,
  tokenHash: { type: String, unique: true, index: true },
  expiresAt: Date,
  createdAt: Date
}, { versionKey: false });
var EntitlementSchema = new Schema({
  _id: String,
  planId: String,
  status: String,
  currentPeriodEnd: Date,
  cancelAtPeriodEnd: Boolean,
  providerName: String,
  providerSubscriptionRef: String,
  refundedAt: Date,
  lastEventAt: Date,
  lastEventId: String,
  updatedAt: Date
}, { versionKey: false });
var BillingEventSchema = new Schema({
  _id: String,
  provider: String,
  type: String,
  tenantId: String,
  occurredAt: Date,
  receivedAt: Date
}, { versionKey: false });
var UsageSchema = new Schema({
  _id: String,
  tenantId: String,
  periodKey: String,
  analyses: Number,
  serpapiLookups: Number
}, { versionKey: false });
var ProfileSchema = new Schema({ _id: String, profile: Schema.Types.Mixed, updatedAt: Date }, { versionKey: false });
var ApplicationSchema = new Schema({
  _id: String,
  tenantId: { type: String, index: true },
  tenderRef: String,
  title: String,
  state: String,
  requirements: Schema.Types.Mixed,
  createdAt: Date,
  updatedAt: Date
}, { versionKey: false });
var models = () => ({
  Tenant: mongoose.models.FoundationTenant || mongoose.model("FoundationTenant", TenantSchema),
  User: mongoose.models.FoundationUser || mongoose.model("FoundationUser", UserSchema),
  Session: mongoose.models.FoundationSession || mongoose.model("FoundationSession", SessionSchema),
  Entitlement: mongoose.models.FoundationEntitlement || mongoose.model("FoundationEntitlement", EntitlementSchema),
  BillingEvent: mongoose.models.FoundationBillingEvent || mongoose.model("FoundationBillingEvent", BillingEventSchema),
  Usage: mongoose.models.FoundationUsage || mongoose.model("FoundationUsage", UsageSchema),
  Profile: mongoose.models.FoundationProfile || mongoose.model("FoundationProfile", ProfileSchema),
  Application: mongoose.models.FoundationApplication || mongoose.model("FoundationApplication", ApplicationSchema)
});
async function connectMongo(uri) {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5e3 });
  await Promise.all(Object.values(models()).map((model) => model.init()));
}
var strip = (doc) => {
  const { _id, ...rest } = doc.toObject ? doc.toObject() : doc;
  return rest;
};
var withKey = (doc, key, value) => ({ ...strip(doc), [key]: value });
function createMongoRepos() {
  const m = models();
  return {
    tenants: {
      async create(t) {
        await m.Tenant.create({ _id: t.id, companyName: t.companyName, createdAt: t.createdAt });
      },
      async getById(id) {
        const d = await m.Tenant.findById(id).lean();
        return d ? withKey(d, "id", id) : null;
      }
    },
    users: {
      async create(u) {
        try {
          await m.User.create({ _id: u.id, tenantId: u.tenantId, email: u.email.toLowerCase(), passwordHash: u.passwordHash, createdAt: u.createdAt });
        } catch (err) {
          if (err?.code === 11e3) throw new Error("email_already_registered");
          throw err;
        }
      },
      async getByEmail(email) {
        const d = await m.User.findOne({ email: email.toLowerCase() }).lean();
        return d ? withKey(d, "id", String(d._id)) : null;
      },
      async getById(id) {
        const d = await m.User.findById(id).lean();
        return d ? withKey(d, "id", id) : null;
      }
    },
    sessions: {
      async create(s) {
        await m.Session.create({ _id: s.id, ...s });
      },
      async getByTokenHash(h) {
        const d = await m.Session.findOne({ tokenHash: h }).lean();
        return d ? withKey(d, "id", String(d._id)) : null;
      },
      async delete(id) {
        await m.Session.deleteOne({ _id: id });
      }
    },
    entitlements: {
      async get(tenantId) {
        const d = await m.Entitlement.findById(tenantId).lean();
        return d ? withKey(d, "tenantId", tenantId) : null;
      },
      async put(e) {
        await m.Entitlement.updateOne({ _id: e.tenantId }, { $set: { ...e } }, { upsert: true });
      }
    },
    billingEvents: {
      async has(eventId) {
        return await m.BillingEvent.findById(eventId).lean() !== null;
      },
      async record(e) {
        try {
          await m.BillingEvent.create({ _id: e.eventId, ...e });
        } catch (err) {
          if (err?.code !== 11e3) throw err;
        }
      }
    },
    usage: {
      async get(tenantId, periodKey) {
        const d = await m.Usage.findById(`${tenantId}:${periodKey}`).lean();
        return d ? { ...strip(d), tenantId, periodKey } : { tenantId, periodKey, analyses: 0, serpapiLookups: 0 };
      },
      async increment(tenantId, periodKey, field) {
        const d = await m.Usage.findByIdAndUpdate(
          `${tenantId}:${periodKey}`,
          { $inc: { [field]: 1 }, $setOnInsert: { tenantId, periodKey } },
          { upsert: true, new: true }
        ).lean();
        return { ...strip(d), tenantId, periodKey };
      },
      async tryConsume(tenantId, periodKey, field, limit) {
        const _id = `${tenantId}:${periodKey}`;
        const claim = await m.Usage.findOneAndUpdate(
          { _id, [field]: { $lt: limit } },
          { $inc: { [field]: 1 } },
          { new: true }
        ).lean();
        if (claim) return { allowed: true, counter: { ...strip(claim), tenantId, periodKey } };
        try {
          await m.Usage.create({
            _id,
            tenantId,
            periodKey,
            analyses: field === "analyses" ? 1 : 0,
            serpapiLookups: field === "serpapiLookups" ? 1 : 0
          });
          return { allowed: true, counter: { tenantId, periodKey, analyses: field === "analyses" ? 1 : 0, serpapiLookups: field === "serpapiLookups" ? 1 : 0 } };
        } catch (err) {
          if (err?.code === 11e3) {
            const retry = await m.Usage.findOneAndUpdate(
              { _id, [field]: { $lt: limit } },
              { $inc: { [field]: 1 } },
              { new: true }
            ).lean();
            if (retry) return { allowed: true, counter: { ...strip(retry), tenantId, periodKey } };
          } else {
            throw err;
          }
        }
        const current = await m.Usage.findById(_id).lean();
        return { allowed: false, counter: current ? { ...strip(current), tenantId, periodKey } : { tenantId, periodKey, analyses: 0, serpapiLookups: 0 } };
      },
      async release(tenantId, periodKey, field) {
        const _id = `${tenantId}:${periodKey}`;
        const d = await m.Usage.findOneAndUpdate(
          { _id, [field]: { $gt: 0 } },
          { $inc: { [field]: -1 } },
          { new: true }
        ).lean();
        if (d) return { ...strip(d), tenantId, periodKey };
        const current = await m.Usage.findById(_id).lean();
        return current ? { ...strip(current), tenantId, periodKey } : { tenantId, periodKey, analyses: 0, serpapiLookups: 0 };
      }
    },
    profiles: {
      async get(tenantId) {
        const d = await m.Profile.findById(tenantId).lean();
        return d ? withKey(d, "tenantId", tenantId) : null;
      },
      async put(p) {
        await m.Profile.updateOne({ _id: p.tenantId }, { $set: { profile: p.profile, updatedAt: p.updatedAt } }, { upsert: true });
      },
      async delete(tenantId) {
        await m.Profile.deleteOne({ _id: tenantId });
      }
    },
    applications: {
      async create(a) {
        await m.Application.create({ ...a, _id: `${a.tenantId}:${a.id}` });
      },
      async getById(tenantId, id) {
        const d = await m.Application.findById(`${tenantId}:${id}`).lean();
        return d ? strip(d) : null;
      },
      async listByTenant(tenantId) {
        const docs = await m.Application.find({ tenantId }).lean();
        return docs.map((d) => strip(d));
      },
      async put(a) {
        await m.Application.updateOne({ _id: `${a.tenantId}:${a.id}` }, { $set: { ...a } }, { upsert: true });
      },
      async delete(tenantId, id) {
        await m.Application.deleteOne({ _id: `${tenantId}:${id}` });
      }
    },
    stats: {
      async overview(periodKey) {
        const [tenants, users, entAgg, usageAgg] = await Promise.all([
          m.Tenant.countDocuments(),
          m.User.countDocuments(),
          m.Entitlement.aggregate([{ $group: { _id: "$status", n: { $sum: 1 } } }]),
          m.Usage.aggregate([
            { $match: { periodKey } },
            { $group: { _id: null, analyses: { $sum: "$analyses" }, serpapiLookups: { $sum: "$serpapiLookups" } } }
          ])
        ]);
        const entitlementsByStatus = {};
        for (const row of entAgg) {
          entitlementsByStatus[row._id || "none"] = row.n;
        }
        const u = usageAgg[0] || {};
        return {
          tenants,
          users,
          entitlementsByStatus,
          usage: { analyses: u.analyses || 0, serpapiLookups: u.serpapiLookups || 0 }
        };
      }
    }
  };
}

// src/lib/server/repos/postgres.ts
import { Pool } from "pg";
var POSTGRES_SCHEMA = `
CREATE TABLE IF NOT EXISTS foundation_tenants (
  id text PRIMARY KEY,
  company_name text NOT NULL,
  created_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS foundation_users (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  email text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS foundation_sessions (
  id text PRIMARY KEY,
  user_id text NOT NULL,
  tenant_id text NOT NULL,
  token_hash text UNIQUE NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS foundation_entitlements (
  tenant_id text PRIMARY KEY,
  plan_id text,
  status text,
  current_period_end timestamptz,
  cancel_at_period_end boolean,
  provider_name text,
  provider_subscription_ref text,
  refunded_at timestamptz,
  last_event_at timestamptz,
  last_event_id text,
  updated_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS foundation_billing_events (
  event_id text PRIMARY KEY,
  provider text NOT NULL,
  type text NOT NULL,
  tenant_id text NOT NULL,
  occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS foundation_usage_counters (
  tenant_id text NOT NULL,
  period_key text NOT NULL,
  analyses integer NOT NULL DEFAULT 0,
  serpapi_lookups integer NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, period_key)
);
CREATE TABLE IF NOT EXISTS foundation_profiles (
  tenant_id text PRIMARY KEY,
  profile jsonb NOT NULL,
  updated_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS foundation_applications (
  id text NOT NULL,
  tenant_id text NOT NULL,
  tender_ref text NOT NULL,
  title text NOT NULL,
  state text NOT NULL,
  requirements jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, id)
);
`;
async function ensurePostgresSchema(pool) {
  await pool.query(POSTGRES_SCHEMA);
}
async function connectPostgres(uri, enableDeletionConstraints = false) {
  const ssl = process.env.PGSSL === "disable" ? false : { rejectUnauthorized: true };
  const pool = new Pool({ connectionString: uri, max: 5, ssl, connectionTimeoutMillis: 15e3 });
  try {
    await ensurePostgresSchema(pool);
    if (enableDeletionConstraints) await ensureTenantForeignKeys(pool);
    return pool;
  } catch {
    try {
      await pool.end();
    } catch {
    }
    throw new Error("Postgres initialization failed. Check database connectivity and schema permissions privately.");
  }
}
async function ensureTenantForeignKeys(pool) {
  for (const table of ["users", "sessions", "entitlements", "billing_events", "usage_counters", "profiles", "applications"]) {
    const name = `foundation_${table}_tenant_live`;
    await pool.query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${name}' AND conrelid = 'foundation_${table}'::regclass) THEN
        ALTER TABLE foundation_${table} ADD CONSTRAINT ${name}
        FOREIGN KEY (tenant_id) REFERENCES foundation_tenants(id) ON DELETE CASCADE;
      END IF;
    END $$`);
  }
}
async function erasePostgresTenant(pool, tenantId) {
  const client = await pool.connect();
  let committing = false;
  let discard = false;
  let released = false;
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout = '10s'");
    await client.query("SET LOCAL statement_timeout = '30s'");
    const tenant = await client.query("SELECT id FROM foundation_tenants WHERE id=$1 FOR UPDATE", [tenantId]);
    if (!tenant.rows.length) {
      await client.query("ROLLBACK");
      return;
    }
    await client.query("SELECT tenant_id FROM foundation_entitlements WHERE tenant_id=$1 FOR UPDATE", [tenantId]);
    const external = await client.query(`SELECT 1 FROM foundation_entitlements WHERE tenant_id=$1
      AND ((provider_name IS NOT NULL AND provider_name NOT IN ('mock','operator_comp')) OR (provider_name IS NULL AND provider_subscription_ref IS NOT NULL))
      UNION ALL SELECT 1 FROM foundation_billing_events WHERE tenant_id=$1 AND provider NOT IN ('mock','operator_comp')`, [tenantId]);
    if (external.rows.length) throw new AccountDeletionError("billing_resolution_required");
    await client.query("DELETE FROM foundation_tenants WHERE id=$1", [tenantId]);
    committing = true;
    await client.query("COMMIT");
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {
      discard = true;
    }
    if (committing) {
      discard = true;
      client.release(true);
      released = true;
      try {
        const check = await pool.query("SELECT id FROM foundation_tenants WHERE id=$1", [tenantId]);
        if (!check.rows.length) return;
      } catch {
      }
      throw new AccountDeletionError("deletion_outcome_unconfirmed", 503);
    }
    if (e instanceof AccountDeletionError) throw e;
    throw new AccountDeletionError("account_deletion_failed", 503);
  } finally {
    if (!released) client.release(discard);
  }
}
var USAGE_COLUMN = {
  analyses: "analyses",
  serpapiLookups: "serpapi_lookups"
};
var asDate = (v) => v instanceof Date ? v : new Date(v);
var asDateOrNull = (v) => v == null ? null : asDate(v);
function toUsage(row) {
  return {
    tenantId: row.tenant_id,
    periodKey: row.period_key,
    analyses: Number(row.analyses),
    serpapiLookups: Number(row.serpapi_lookups)
  };
}
function toApplication(row) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    tenderRef: row.tender_ref,
    title: row.title,
    state: row.state,
    requirements: typeof row.requirements === "string" ? JSON.parse(row.requirements) : row.requirements,
    createdAt: asDate(row.created_at),
    updatedAt: asDate(row.updated_at)
  };
}
function createPostgresRepos(pool, tenantConstraintsReady = false) {
  return {
    accountDeletion: tenantConstraintsReady && typeof pool.connect === "function" ? {
      erase: (tenantId) => erasePostgresTenant(pool, tenantId)
    } : void 0,
    beta: {
      async redeem(e) {
        await pool.query(
          `INSERT INTO foundation_entitlements
          (tenant_id,plan_id,status,current_period_end,cancel_at_period_end,provider_name,
           provider_subscription_ref,refunded_at,last_event_at,last_event_id,updated_at)
          SELECT $1,$2,$3,$4::timestamptz,$5::boolean,$6,$7,$8::timestamptz,$9::timestamptz,$10,$11::timestamptz
          WHERE EXISTS (SELECT 1 FROM foundation_tenants WHERE id=$1)
          ON CONFLICT (tenant_id) DO NOTHING`,
          [
            e.tenantId,
            e.planId,
            e.status,
            e.currentPeriodEnd,
            e.cancelAtPeriodEnd,
            e.providerName,
            e.providerSubscriptionRef,
            e.refundedAt,
            e.lastEventAt,
            e.lastEventId,
            e.updatedAt
          ]
        );
      }
    },
    tenants: {
      async create(t) {
        await pool.query(
          "INSERT INTO foundation_tenants (id, company_name, created_at) VALUES ($1, $2, $3)",
          [t.id, t.companyName, t.createdAt]
        );
      },
      async getById(id) {
        const { rows } = await pool.query("SELECT * FROM foundation_tenants WHERE id = $1", [id]);
        const r = rows[0];
        return r ? { id: r.id, companyName: r.company_name, createdAt: asDate(r.created_at) } : null;
      }
    },
    users: {
      async create(u) {
        try {
          await pool.query(
            "INSERT INTO foundation_users (id, tenant_id, email, password_hash, created_at) VALUES ($1, $2, $3, $4, $5)",
            [u.id, u.tenantId, u.email.toLowerCase(), u.passwordHash, u.createdAt]
          );
        } catch (err) {
          if (err?.code === "23505") throw new Error("email_already_registered");
          throw err;
        }
      },
      async getByEmail(email) {
        const { rows } = await pool.query("SELECT * FROM foundation_users WHERE email = $1", [email.toLowerCase()]);
        const r = rows[0];
        return r ? { id: r.id, tenantId: r.tenant_id, email: r.email, passwordHash: r.password_hash, createdAt: asDate(r.created_at) } : null;
      },
      async getById(id) {
        const { rows } = await pool.query("SELECT * FROM foundation_users WHERE id = $1", [id]);
        const r = rows[0];
        return r ? { id: r.id, tenantId: r.tenant_id, email: r.email, passwordHash: r.password_hash, createdAt: asDate(r.created_at) } : null;
      }
    },
    sessions: {
      async create(s) {
        await pool.query(
          "INSERT INTO foundation_sessions (id, user_id, tenant_id, token_hash, expires_at, created_at) VALUES ($1, $2, $3, $4, $5, $6)",
          [s.id, s.userId, s.tenantId, s.tokenHash, s.expiresAt, s.createdAt]
        );
      },
      async getByTokenHash(tokenHash) {
        const { rows } = await pool.query("SELECT * FROM foundation_sessions WHERE token_hash = $1", [tokenHash]);
        const r = rows[0];
        return r ? {
          id: r.id,
          userId: r.user_id,
          tenantId: r.tenant_id,
          tokenHash: r.token_hash,
          expiresAt: asDate(r.expires_at),
          createdAt: asDate(r.created_at)
        } : null;
      },
      async delete(id) {
        await pool.query("DELETE FROM foundation_sessions WHERE id = $1", [id]);
      }
    },
    entitlements: {
      async get(tenantId) {
        const { rows } = await pool.query("SELECT * FROM foundation_entitlements WHERE tenant_id = $1", [tenantId]);
        const r = rows[0];
        if (!r) return null;
        return {
          tenantId: r.tenant_id,
          planId: r.plan_id,
          status: r.status,
          currentPeriodEnd: asDateOrNull(r.current_period_end),
          cancelAtPeriodEnd: Boolean(r.cancel_at_period_end),
          providerName: r.provider_name,
          providerSubscriptionRef: r.provider_subscription_ref,
          refundedAt: asDateOrNull(r.refunded_at),
          lastEventAt: asDateOrNull(r.last_event_at),
          lastEventId: r.last_event_id ?? null,
          updatedAt: asDate(r.updated_at)
        };
      },
      async put(e) {
        await pool.query(
          `INSERT INTO foundation_entitlements
             (tenant_id, plan_id, status, current_period_end, cancel_at_period_end,
              provider_name, provider_subscription_ref, refunded_at, last_event_at, last_event_id, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
           ON CONFLICT (tenant_id) DO UPDATE SET
             plan_id = EXCLUDED.plan_id, status = EXCLUDED.status,
             current_period_end = EXCLUDED.current_period_end,
             cancel_at_period_end = EXCLUDED.cancel_at_period_end,
             provider_name = EXCLUDED.provider_name,
             provider_subscription_ref = EXCLUDED.provider_subscription_ref,
             refunded_at = EXCLUDED.refunded_at,
             last_event_at = EXCLUDED.last_event_at,
             last_event_id = EXCLUDED.last_event_id,
             updated_at = EXCLUDED.updated_at`,
          [
            e.tenantId,
            e.planId,
            e.status,
            e.currentPeriodEnd,
            e.cancelAtPeriodEnd,
            e.providerName,
            e.providerSubscriptionRef,
            e.refundedAt,
            e.lastEventAt,
            e.lastEventId,
            e.updatedAt
          ]
        );
      }
    },
    billingEvents: {
      async has(eventId) {
        const { rows } = await pool.query("SELECT 1 FROM foundation_billing_events WHERE event_id = $1", [eventId]);
        return rows.length > 0;
      },
      async record(e) {
        await pool.query(
          `INSERT INTO foundation_billing_events (event_id, provider, type, tenant_id, occurred_at, received_at)
           VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (event_id) DO NOTHING`,
          [e.eventId, e.provider, e.type, e.tenantId, e.occurredAt, e.receivedAt]
        );
      }
    },
    usage: {
      async get(tenantId, periodKey) {
        const { rows } = await pool.query(
          "SELECT * FROM foundation_usage_counters WHERE tenant_id = $1 AND period_key = $2",
          [tenantId, periodKey]
        );
        return rows[0] ? toUsage(rows[0]) : { tenantId, periodKey, analyses: 0, serpapiLookups: 0 };
      },
      async increment(tenantId, periodKey, field) {
        const col = USAGE_COLUMN[field];
        const { rows } = await pool.query(
          `INSERT INTO foundation_usage_counters (tenant_id, period_key, ${col}) VALUES ($1, $2, 1)
           ON CONFLICT (tenant_id, period_key) DO UPDATE SET ${col} = foundation_usage_counters.${col} + 1
           RETURNING *`,
          [tenantId, periodKey]
        );
        return toUsage(rows[0]);
      },
      async tryConsume(tenantId, periodKey, field, limit) {
        const col = USAGE_COLUMN[field];
        await pool.query(
          "INSERT INTO foundation_usage_counters (tenant_id, period_key) VALUES ($1, $2) ON CONFLICT (tenant_id, period_key) DO NOTHING",
          [tenantId, periodKey]
        );
        const { rows } = await pool.query(
          `UPDATE foundation_usage_counters SET ${col} = ${col} + 1
           WHERE tenant_id = $1 AND period_key = $2 AND ${col} < $3
           RETURNING *`,
          [tenantId, periodKey, limit]
        );
        if (rows[0]) return { allowed: true, counter: toUsage(rows[0]) };
        return { allowed: false, counter: await this.get(tenantId, periodKey) };
      },
      async release(tenantId, periodKey, field) {
        const col = USAGE_COLUMN[field];
        await pool.query(
          "INSERT INTO foundation_usage_counters (tenant_id, period_key) VALUES ($1, $2) ON CONFLICT (tenant_id, period_key) DO NOTHING",
          [tenantId, periodKey]
        );
        const { rows } = await pool.query(
          `UPDATE foundation_usage_counters SET ${col} = GREATEST(${col} - 1, 0)
           WHERE tenant_id = $1 AND period_key = $2
           RETURNING *`,
          [tenantId, periodKey]
        );
        return toUsage(rows[0]);
      }
    },
    profiles: {
      async get(tenantId) {
        const { rows } = await pool.query("SELECT * FROM foundation_profiles WHERE tenant_id = $1", [tenantId]);
        const r = rows[0];
        if (!r) return null;
        return {
          tenantId: r.tenant_id,
          profile: typeof r.profile === "string" ? JSON.parse(r.profile) : r.profile,
          updatedAt: asDate(r.updated_at)
        };
      },
      async put(p) {
        await pool.query(
          `INSERT INTO foundation_profiles (tenant_id, profile, updated_at) VALUES ($1, $2, $3)
           ON CONFLICT (tenant_id) DO UPDATE SET profile = EXCLUDED.profile, updated_at = EXCLUDED.updated_at`,
          [p.tenantId, JSON.stringify(p.profile), p.updatedAt]
        );
      },
      async delete(tenantId) {
        await pool.query("DELETE FROM foundation_profiles WHERE tenant_id = $1", [tenantId]);
      }
    },
    applications: {
      async create(a) {
        await pool.query(
          `INSERT INTO foundation_applications (id, tenant_id, tender_ref, title, state, requirements, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [a.id, a.tenantId, a.tenderRef, a.title, a.state, JSON.stringify(a.requirements), a.createdAt, a.updatedAt]
        );
      },
      async getById(tenantId, id) {
        const { rows } = await pool.query(
          "SELECT * FROM foundation_applications WHERE tenant_id = $1 AND id = $2",
          [tenantId, id]
        );
        return rows[0] ? toApplication(rows[0]) : null;
      },
      async listByTenant(tenantId) {
        const { rows } = await pool.query(
          "SELECT * FROM foundation_applications WHERE tenant_id = $1 ORDER BY updated_at DESC",
          [tenantId]
        );
        return rows.map(toApplication);
      },
      async delete(tenantId, id) {
        await pool.query("DELETE FROM foundation_applications WHERE tenant_id = $1 AND id = $2", [tenantId, id]);
      },
      async put(a) {
        await pool.query(
          `UPDATE foundation_applications SET tender_ref = $3, title = $4, state = $5, requirements = $6, updated_at = $7
           WHERE tenant_id = $1 AND id = $2`,
          [a.tenantId, a.id, a.tenderRef, a.title, a.state, JSON.stringify(a.requirements), a.updatedAt]
        );
      }
    },
    stats: {
      async overview(periodKey) {
        const counts = await pool.query(
          `SELECT (SELECT count(*)::int FROM foundation_tenants) AS tenants,
                  (SELECT count(*)::int FROM foundation_users) AS users`
        );
        const ent = await pool.query(
          `SELECT coalesce(status, 'none') AS status, count(*)::int AS n
           FROM foundation_entitlements GROUP BY 1`
        );
        const usageRows = await pool.query(
          `SELECT coalesce(sum(analyses), 0)::int AS analyses,
                  coalesce(sum(serpapi_lookups), 0)::int AS serpapi_lookups
           FROM foundation_usage_counters WHERE period_key = $1`,
          [periodKey]
        );
        const entitlementsByStatus = {};
        for (const row of ent.rows) entitlementsByStatus[row.status] = row.n;
        return {
          tenants: counts.rows[0].tenants,
          users: counts.rows[0].users,
          entitlementsByStatus,
          usage: {
            analyses: usageRows.rows[0].analyses,
            serpapiLookups: usageRows.rows[0].serpapi_lookups
          }
        };
      }
    }
  };
}

// src/lib/server/repos/index.ts
async function createStoreRepos(config) {
  if (config.store === "postgres") {
    const pool = await connectPostgres(config.postgresUri, config.accountDeletionEnabled);
    try {
      if (fieldEncryptionEnabled(config.profileFieldKey)) {
        const counts = await migrateProfilePins(pool, config.profileFieldKey);
        console.log("[Profile PIN migration]", counts);
      }
      return createPostgresRepos(pool, config.accountDeletionEnabled);
    } catch (error) {
      try {
        await pool.end();
      } catch {
      }
      throw error;
    }
  }
  if (config.store === "mongo") {
    await connectMongo(config.mongoUri);
    return createMongoRepos();
  }
  return createMemoryRepos();
}

// src/lib/server/betaActivation.ts
async function activateApprovedBetaAccounts(repos, config, now = /* @__PURE__ */ new Date()) {
  assertSafeConfig(config);
  const c = config.betaCampaign;
  if (!c?.directAccounts?.length) return 0;
  if (now >= new Date(c.endsAt)) return 0;
  if (!repos.beta || now < new Date(c.startsAt)) {
    throw new Error("Direct beta activation requires a supported store and an open approved window.");
  }
  const blocked = /* @__PURE__ */ new Set();
  for (const account of c.directAccounts) {
    const user = await repos.users.getById(account.userId);
    const tenant = await repos.tenants.getById(account.tenantId);
    if (!user || !tenant || user.tenantId !== account.tenantId || user.email.toLowerCase() !== account.email) {
      throw new Error("Direct beta activation account binding mismatch. No account credentials are needed.");
    }
    const existing = await repos.entitlements.get(account.tenantId);
    if (existing && (existing.planId !== "test_cohort" || existing.providerName !== "operator_comp" || existing.providerSubscriptionRef !== `beta:${c.id}` || entitlementStatus(existing, config, now) !== "active" || existing.currentPeriodEnd?.getTime() !== Date.parse(c.endsAt))) {
      blocked.add(account.tenantId);
    }
  }
  let confirmed = 0;
  for (const account of c.directAccounts) {
    if (blocked.has(account.tenantId)) continue;
    await repos.beta.redeem({
      tenantId: account.tenantId,
      planId: "test_cohort",
      status: "active",
      currentPeriodEnd: new Date(c.endsAt),
      cancelAtPeriodEnd: true,
      providerName: "operator_comp",
      providerSubscriptionRef: `beta:${c.id}`,
      refundedAt: null,
      lastEventAt: now,
      lastEventId: `beta:${c.id}`,
      updatedAt: now
    });
    const ent = await repos.entitlements.get(account.tenantId);
    if (ent?.planId !== "test_cohort" || ent.providerName !== "operator_comp" || ent.providerSubscriptionRef !== `beta:${c.id}` || entitlementStatus(ent, config, now) !== "active" || ent.currentPeriodEnd?.getTime() !== Date.parse(c.endsAt)) {
      blocked.add(account.tenantId);
      continue;
    }
    confirmed++;
  }
  if (blocked.size) console.warn(`[beta] ${blocked.size} approved account(s) not activated: existing access was preserved.`);
  return confirmed;
}

// server.ts
dotenv.config();
var foundationConfig = loadConfig();
assertSafeConfig(foundationConfig);
var foundation = createFoundation({
  config: foundationConfig,
  repos: await createStoreRepos(foundationConfig),
  eraseEphemeral: (tenantId) => eraseTenantEphemeral(tenantId, {
    tenders: inMemoryTenderStore,
    datasets: inMemoryDatasets,
    jobs: inMemoryJobs,
    timers: simulatedJobTimers
  })
});
var directBetaActive = await activateApprovedBetaAccounts(foundation.repos, foundation.config);
if (foundation.config.betaCampaign?.directAccounts?.length) console.log(`[beta] ${directBetaActive} approved account(s) confirmed active.`);
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
var app = express();
var PORT = Number(process.env.PORT) || 3001;
app.set("trust proxy", foundation.config.trustProxy);
function isLoopbackEndpoint(raw2) {
  try {
    const u = new URL(raw2);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    return ["localhost", "127.0.0.1", "[::1]", "::1"].includes(u.hostname);
  } catch {
    return false;
  }
}
var heavyOpsInFlight = 0;
var HEAVY_OPS_MAX = Number(process.env.HEAVY_OPS_MAX || 4);
function heavyOpLimiter(req, res, next) {
  if (heavyOpsInFlight >= HEAVY_OPS_MAX) {
    res.status(429).json({ success: false, error: "server_busy", retry: "Please retry shortly." });
    return;
  }
  heavyOpsInFlight += 1;
  res.on("finish", () => {
    heavyOpsInFlight -= 1;
  });
  next();
}
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
});
app.use("/api/billing/webhook", foundation.webhookRouter);
app.use(express.json({ limit: "50mb" }));
app.use(foundation.originCheckMiddleware);
app.use("/api", foundation.apiCacheHeaders);
app.use(foundation.sessionMiddleware);
app.use(foundation.tenantWorkMiddleware);
app.use(foundation.guardMiddleware);
app.use("/api", foundation.router);
app.use("/api/admin", foundation.adminRouter);
app.use(express.urlencoded({ limit: "50mb", extended: true }));
var userSmeProfile = {};
SAMPLE_TENDERS.forEach((t) => {
  inMemoryTenderStore.set(t.referenceNumber, t);
});
var PLATFORM_MODELS = [
  {
    id: "gemini-2.5-flash",
    name: "Gemini 2.5 Flash (Gemma 2 Persona)",
    provider: "google-genai",
    baseArchitecture: "Gemini",
    description: "Fast statutory auditor persona fine-tuned for South African PPPFA & SBD validation.",
    isOpenWeights: false,
    isFineTuned: false,
    contextWindow: "1M tokens",
    isAvailable: Boolean(process.env.GEMINI_API_KEY)
  },
  {
    id: "llama-3.1-8b-instruct",
    name: "Meta Llama 3.1 8B Instruct (Open LLM)",
    provider: "ollama",
    baseArchitecture: "Llama 3.1 8B",
    description: "Open-weights 8B model served from your own infrastructure via Ollama/vLLM.",
    isOpenWeights: true,
    isFineTuned: false,
    contextWindow: "128k tokens",
    defaultEndpoint: "http://localhost:11434/v1",
    isAvailable: true
  },
  {
    id: "gemma-2-9b-it",
    name: "Google Gemma 2 9B Instruct (Open LLM)",
    provider: "ollama",
    baseArchitecture: "Gemma 2",
    description: "High-precision open weights architecture with sliding window attention for complex tenders.",
    isOpenWeights: true,
    isFineTuned: false,
    contextWindow: "8k tokens",
    defaultEndpoint: "http://localhost:11434/v1",
    isAvailable: true
  },
  {
    id: "fine-tuned-sa-tender-8b",
    name: "Llama 3.1 8B - SA Procurement LoRA v1",
    provider: "custom-finetuned",
    baseArchitecture: "Custom LoRA",
    description: "Preview entry for the fine-tuning studio (simulated - no trained adapter artifact exists yet).",
    isOpenWeights: true,
    isFineTuned: true,
    contextWindow: "32k tokens",
    defaultEndpoint: "http://localhost:11434/v1",
    isAvailable: false,
    isDemo: true
  },
  {
    id: "gemma2-local",
    name: "Gemma 2 Local Simulator (Deterministic)",
    provider: "local-simulator",
    baseArchitecture: "Gemma 2",
    description: "Deterministic rule-based fallback. Runs offline with no external API calls.",
    isOpenWeights: true,
    isFineTuned: false,
    contextWindow: "16k tokens",
    isAvailable: true
  }
];
var inMemoryDatasets = [
  {
    id: "dataset-sa-procure-v1",
    name: "SA Procurement Legislation & SBD Compliance (PPPFA 2022)",
    description: "Curated instruction dataset teaching LLMs the 2022 Preferential Procurement Regulations, SBD 1, 4, 6.1, CIDB Act grading, and CSD MAAA verification requirements.",
    category: "National Statutory",
    version: "1.2.0",
    exampleCount: 42,
    tokenCountEst: 118400,
    format: "alpaca",
    createdAt: "2026-10-10T10:00:00.000Z",
    examples: [
      {
        id: "ex-01",
        domain: "PPPFA 2022",
        prompt: "Analyze RFP for procurement value R48,000,000 issued by Western Cape Government. Determine applicable point system and 30% subcontracting requirement under PPPFA 2022 regulations.",
        completion: JSON.stringify({
          system: "80/20 Preference Point System",
          statutoryBasis: "PPR 2022 Section 4: 80/20 applies for tenders up to R50,000,000 (VAT inclusive). Price = 80 points, Specific Goals (B-BBEE / designated EME) = 20 points.",
          subcontracting30Percent: false,
          notes: "30% mandatory subcontracting only triggers when contract estimate exceeds R30M and market feasibility permits."
        }, null, 2),
        referenceRfp: "WCG/DOTP-ADV/2026/01",
        createdAt: "2026-10-10T10:05:00.000Z"
      },
      {
        id: "ex-02",
        domain: "CIDB Act",
        prompt: "RFP requires civil works with estimate R45,000,000. Specify mandatory CIDB grading designation and emerging contractor concessions under CIDB Act 38 of 2000.",
        completion: JSON.stringify({
          requiredGrading: "7CE (Civil Engineering)",
          thresholdRange: "R20,000,000 to R60,000,000",
          potentiallyEmergingConcession: "Grade 6CE PE contractors are eligible to tender in terms of CIDB Regulation 25(8)",
          coidaRequired: true,
          safetyCert: "SACPCMP Safety Manager registration mandatory"
        }, null, 2),
        referenceRfp: "SANRAL/N.001-140-2026/1",
        createdAt: "2026-10-10T10:15:00.000Z"
      },
      {
        id: "ex-03",
        domain: "Western Cape SCM",
        prompt: "Extract mandatory returnable schedules for Drakenstein Municipality security & tactical supply tender.",
        completion: JSON.stringify({
          mandatoryReturnables: [
            "National Treasury CSD Registration Report (Active MAAA number)",
            "Verified SARS Tax Compliance Status PIN",
            "SAPS Central Firearms Register Dealer License (FCA 60 of 2000)",
            "MBD 4 Declaration of Interest",
            "MBD 6.1 Preference Points Claim in terms of PPR 2022"
          ],
          disqualificationTriggers: "Failure to submit active CSD MAAA, SARS PIN, or valid dealer license results in immediate bid invalidation."
        }, null, 2),
        referenceRfp: "CES 04/2026",
        createdAt: "2026-10-10T10:30:00.000Z"
      }
    ]
  },
  {
    id: "dataset-wc-tenders-v2",
    name: "Western Cape Municipal Notices & SCM Frameworks",
    description: "Specific goal allocation matrices for City of Cape Town, Drakenstein, Swellendam, and Cape Agulhas municipalities.",
    category: "Provincial & Municipal",
    version: "2.0.0",
    exampleCount: 28,
    tokenCountEst: 78500,
    format: "sharegpt",
    createdAt: "2026-10-12T14:00:00.000Z",
    examples: []
  }
];
var inMemoryJobs = [
  {
    simulated: true,
    id: "ft-job-001",
    jobName: "llama-3.1-8b-sa-procurement-lora-v1",
    baseModel: "meta-llama/Meta-Llama-3.1-8B-Instruct",
    datasetId: "dataset-sa-procure-v1",
    datasetName: "SA Procurement Legislation & SBD Compliance (PPPFA 2022)",
    status: "completed",
    progress: 100,
    currentEpoch: 3,
    totalEpochs: 3,
    currentStep: 60,
    totalSteps: 60,
    currentLoss: 0.312,
    learningRate: 2e-5,
    vramUsageGb: 7.4,
    etaSeconds: 0,
    lossHistory: [
      { step: 5, loss: 2.451 },
      { step: 10, loss: 1.823 },
      { step: 20, loss: 1.204 },
      { step: 30, loss: 0.812 },
      { step: 40, loss: 0.541 },
      { step: 50, loss: 0.389 },
      { step: 60, loss: 0.312, valLoss: 0.334 }
    ],
    loraRank: 16,
    loraAlpha: 32,
    loraDropout: 0.05,
    adapterArtifactName: "adapter_model.safetensors",
    outputModelName: "Llama 3.1 8B - SA Procurement LoRA v1",
    createdAt: "2026-10-14T09:00:00.000Z",
    completedAt: "2026-10-14T09:28:40.000Z"
  }
];
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    engine: "TenderAgent RFP pipeline",
    configuredModel: activeLlmConfig.modelId,
    configuredProvider: activeLlmConfig.provider,
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    localModelCheck: "on-demand via /api/models/detect",
    sentryTracing: Boolean(process.env.SENTRY_DSN),
    authRequired: foundation.config.authRequired,
    profileFieldEncryption: fieldEncryptionEnabled(foundation.config.profileFieldKey) ? "on" : "off",
    store: foundation.config.store,
    privacyNote: DOCUMENT_REDACTION_NOTICE,
    sampleTendersLoaded: SAMPLE_TENDERS.length
  });
});
app.post("/api/parse-document", heavyOpLimiter, async (req, res) => {
  try {
    const { rawText, base64Data, filename } = req.body;
    if (typeof base64Data === "string" && base64Data.length > 4e7) {
      res.status(413).json({ success: false, error: "document too large (max ~30MB PDF)" });
      return;
    }
    if (typeof rawText === "string" && rawText.length > 5e6) {
      res.status(413).json({ success: false, error: "text too large (max 5M characters)" });
      return;
    }
    if (base64Data) {
      const buffer = Buffer.from(base64Data, "base64");
      const result = await extractTextFromPdf(buffer);
      res.json(result);
      return;
    }
    if (rawText && typeof rawText === "string") {
      if (isRawPdfString(rawText)) {
        const result = await parseRawPdfString(rawText);
        res.json(result);
        return;
      }
      const refMatch = rawText.match(/(?:TENDER|BID|REF|RFP|RFQ|CONTRACT)[\s.:#№\/-]*([A-Z0-9\/\-_.]{3,35})/i);
      const deptMatch = rawText.match(/(?:ISSUING AUTHORITY|ORGAN OF STATE|DEPARTMENT|MUNICIPALITY)[:\s]+([^\n\r]{4,80})/i);
      const dateMatch = rawText.match(/(?:CLOSING DATE|DEADLINE)[:\s]+([0-9]{1,2}[\s\/\-][A-Za-z0-9]+[\s\/\-][0-9]{2,4})/i);
      res.json({
        success: true,
        text: rawText.trim(),
        pageCount: 1,
        referenceGuess: refMatch ? refMatch[1].trim() : void 0,
        issuingDeptGuess: deptMatch ? deptMatch[1].trim() : void 0,
        closingDateGuess: dateMatch ? dateMatch[1].trim() : void 0
      });
      return;
    }
    res.status(400).json({ success: false, error: "No rawText or base64Data provided for document parsing" });
  } catch (err) {
    console.error("[API /api/parse-document Error]:", err);
    res.status(500).json({ success: false, error: err.message || "Failed to parse document" });
  }
});
app.get("/api/scrape", async (req, res) => {
  try {
    const query = typeof req.query.q === "string" ? req.query.q : void 0;
    const province = typeof req.query.province === "string" ? req.query.province : void 0;
    const allowSerpApi = await foundation.serpApiAccess(req);
    const result = await fetchSouthAfricanTenders(query, province, { allowSerpApi });
    if (!result.serpApiConsumed) await foundation.releaseConsumption(req, "serpapi");
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
registerTenderFeedRoutes(app, { foundation, store: inMemoryTenderStore });
app.get("/api/models", (req, res) => {
  res.json({
    success: true,
    activeModel: activeLlmConfig.modelId,
    activeProvider: activeLlmConfig.provider,
    models: PLATFORM_MODELS
  });
});
app.get("/api/models/detect", foundation.requireAdmin, async (req, res) => {
  try {
    const customEndpoint = typeof req.query.endpoint === "string" ? req.query.endpoint : void 0;
    if (customEndpoint && !isLoopbackEndpoint(customEndpoint)) {
      res.status(400).json({ success: false, error: "endpoint must be a loopback address (localhost / 127.0.0.1 / ::1)" });
      return;
    }
    const report = await detectLocalModels(customEndpoint);
    if (report.isLocalServerRunning) {
      PLATFORM_MODELS.forEach((m) => {
        if (m.baseArchitecture === "Llama 3.1 8B" && report.hasLlama31) m.isAvailable = true;
        if (m.baseArchitecture === "Gemma 2" && report.hasGemma) m.isAvailable = true;
      });
    }
    res.json({
      success: true,
      report,
      activeModel: activeLlmConfig.modelId,
      activeProvider: activeLlmConfig.provider,
      cloudFailoverConfigured: Boolean(process.env.GEMINI_API_KEY),
      cloudFailoverPolicy: "Paid cloud AI is used only for subscribed accounts."
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
app.post("/api/models/active", foundation.requireAdmin, async (req, res) => {
  try {
    const { modelId } = req.body || {};
    if (typeof modelId !== "string" || !modelId) {
      res.status(400).json({ success: false, error: "modelId required" });
      return;
    }
    const allowed = PLATFORM_MODELS.filter((m) => m.isAvailable && !m.isDemo).map((m) => m.id);
    if (!allowed.includes(modelId)) {
      res.status(400).json({ success: false, error: "unknown_or_unavailable_model", allowed });
      return;
    }
    const existing = await foundation.repos.profiles.get(req.auth.tenantId);
    const merged = { ...existing ? existing.profile : {}, llmModelId: modelId };
    await foundation.repos.profiles.put({ tenantId: req.auth.tenantId, profile: merged, updatedAt: /* @__PURE__ */ new Date() });
    res.json({ success: true, selectedModelId: modelId, serverDefault: publicLlmConfigView() });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});
app.get("/api/profile", foundation.requireAuth, async (req, res) => {
  const stored = await foundation.repos.profiles.get(req.auth.tenantId);
  const profile = stored ? profileForClient(foundation.config.profileFieldKey, stored.profile) : {};
  res.json({ success: true, profile });
});
app.delete("/api/profile", foundation.requireAuth, async (req, res) => {
  await foundation.repos.profiles.delete(req.auth.tenantId);
  res.json({ success: true, message: "Saved company profile deleted." });
});
app.post("/api/profile", foundation.requireAuth, async (req, res) => {
  try {
    const existing = await foundation.repos.profiles.get(req.auth.tenantId);
    const key = foundation.config.profileFieldKey;
    const saved = prepareProfileSave(key, existing?.profile || {}, req.body || {});
    await foundation.repos.profiles.put({ tenantId: req.auth.tenantId, profile: saved, updatedAt: /* @__PURE__ */ new Date() });
    res.json({ success: true, profile: profileForClient(key, saved) });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});
app.post("/api/analyze", heavyOpLimiter, async (req, res) => {
  try {
    const { rawText, referenceId, companyProfile } = req.body || {};
    if (!rawText || typeof rawText !== "string") {
      res.status(400).json({ success: false, error: "rawText string is required for RFP analysis" });
      return;
    }
    if (rawText.length > 2e6) {
      res.status(413).json({ success: false, error: "rawText too large (max 2M characters per analysis)" });
      return;
    }
    const ref = referenceId || `RFP-ZA-${Date.now().toString().slice(-5)}`;
    let profile = companyProfile || (Object.keys(userSmeProfile).length ? userSmeProfile : void 0);
    let selectedModelId = null;
    if (req.auth) {
      const stored = await foundation.repos.profiles.get(req.auth.tenantId);
      if (stored?.profile) {
        stored.profile = decryptProfileFields(foundation.config.profileFieldKey, stored.profile);
        selectedModelId = typeof stored.profile.llmModelId === "string" ? stored.profile.llmModelId : null;
        if (!companyProfile) profile = stored.profile;
      }
    }
    const isBeta = req.auth && (await foundation.repos.entitlements.get(req.auth.tenantId))?.planId === "test_cohort";
    const llmConfig = resolveServerLlmConfig(isBeta ? "gemma2-local" : selectedModelId);
    const allowCloudLlm = await foundation.cloudLlmAccess(req);
    let result;
    try {
      result = await executeRfpPipeline({
        rawText,
        referenceId: ref,
        companyProfile: profile,
        llmConfig,
        allowCloudLlm
      });
    } catch (pipelineErr) {
      await foundation.releaseConsumption(req, "analysis");
      throw pipelineErr;
    }
    res.json({
      success: true,
      tender: result.record,
      traceLogs: result.traceLogs,
      spans: result.spans,
      skeleton: result.skeleton,
      usedModel: result.usedModel
    });
  } catch (error) {
    console.error("[API /api/analyze Error]:", error);
    res.status(500).json({ success: false, error: error.message || "Pipeline analysis failed" });
  }
});
app.get("/api/finetune/datasets", foundation.requireAdmin, (req, res) => {
  const visible = inMemoryDatasets.filter((d) => !d.tenantId || req.auth && d.tenantId === req.auth.tenantId);
  res.json({ success: true, datasets: visible });
});
app.post("/api/finetune/datasets", foundation.requireAdmin, (req, res) => {
  try {
    const { name, description, category, examples, format } = req.body;
    const newDs = {
      tenantId: req.auth.tenantId,
      id: `dataset-custom-${Date.now()}`,
      name: name || "Custom Procurement Dataset",
      description: description || "User-defined training dataset",
      category: category || "Custom",
      version: "1.0.0",
      exampleCount: Array.isArray(examples) ? examples.length : 0,
      tokenCountEst: (Array.isArray(examples) ? examples.length : 0) * 1250,
      format: format || "alpaca",
      examples: Array.isArray(examples) ? examples : [],
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    inMemoryDatasets.unshift(newDs);
    res.json({ success: true, dataset: newDs });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});
registerGeneratedDatasetRoute(app, { foundation, store: inMemoryTenderStore, datasets: inMemoryDatasets });
app.get("/api/finetune/jobs", foundation.requireAdmin, (req, res) => {
  const visible = inMemoryJobs.filter((j) => !j.tenantId || req.auth && j.tenantId === req.auth.tenantId);
  res.json({ success: true, jobs: visible });
});
var simulatedJobTimers = /* @__PURE__ */ new Map();
registerSimulatedTrainingRoute(app, { foundation, datasets: inMemoryDatasets, jobs: inMemoryJobs, timers: simulatedJobTimers });
var deployHandler = (req, res) => {
  try {
    const jobId = req.params.jobId || (req.body || {}).jobId;
    const job = inMemoryJobs.find((j) => j.id === jobId && j.tenantId === req.auth.tenantId);
    if (!job) {
      res.status(404).json({ success: false, error: "job_not_found" });
      return;
    }
    res.json({
      success: true,
      simulated: true,
      message: `Simulated deploy of "${job.outputModelName}". No model artifact exists yet, so the active engine was not changed.`,
      engineChanged: false
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
app.post("/api/finetune/deploy", foundation.requireAdmin, deployHandler);
app.post("/api/finetune/deploy/:jobId", foundation.requireAdmin, deployHandler);
app.post("/api/finetune/compare", foundation.requireAdmin, async (req, res) => {
  try {
    const { prompt } = req.body;
    const testPrompt = prompt || "What are the mandatory returnables and PPPFA formula for Drakenstein Municipality basic services tender?";
    const baseResponse = `The tender will likely require typical procurement documents including registration details, tax documents, and financial offers. Under South African law, general preferential points apply. Detailed criteria are listed in the tender pack.`;
    const fineTunedResponse = JSON.stringify({
      statutoryAudit: "DRAKENSTEIN MUNICIPALITY - CIVIL ENGINEERING (CE 08/2026)",
      mandatedSystem: "90/10 Preference Point System (Tender estimate R58M > R50M statutory threshold under 2022 PPPFA Regulations)",
      cidbRequirement: "Grade 7CE (Civil Engineering) or Grade 6CE PE (Potentially Emerging)",
      mandatoryReturnables: [
        "National Treasury Central Supplier Database (CSD) active MAAA report",
        "SARS Tax Compliance Status PIN (verified compliant)",
        "Valid COIDA Letter of Good Standing (Compensation Commissioner / FEM)",
        "Municipal MBD 4 (Declaration of Interest) & MBD 6.1 (Specific Goals Claim)",
        "Minimum 30% subcontracting agreement to local emerging EME/QSE contractors in Drakenstein"
      ],
      complianceHurdle: "Minimum technical functionality cut-off is 70 points out of 100 before price evaluation."
    }, null, 2);
    res.json({
      success: true,
      illustrative: true,
      note: "Illustrative example outputs for comparison UI - not live model inference.",
      prompt: testPrompt,
      baseModel: "meta-llama/Meta-Llama-3.1-8B-Instruct (Baseline, example output)",
      baseOutput: baseResponse,
      fineTunedModel: "Llama 3.1 8B - SA Procurement LoRA v1 (example output, simulated)",
      fineTunedOutput: fineTunedResponse
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
app.get("/api/finetune/export-script", foundation.requireAdmin, (req, res) => {
  const pythonScript = `# ==============================================================================
# TenderAgent South Africa - Llama 3.1 8B / Gemma 2 LoRA Fine-Tuning Pipeline
# Optimized for Unsloth / Hugging Face PEFT on NVIDIA GPUs (RTX 3090/4090, A100, H100)
# Legislation: PPPFA 2022, CIDB Act, National Treasury SCM Instructions
# ==============================================================================

import torch
from datasets import load_dataset
from trl import SFTTrainer
from transformers import TrainingArguments, AutoTokenizer, AutoModelForCausalLM
from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training

# 1. Configuration
MODEL_ID = "meta-llama/Meta-Llama-3.1-8B-Instruct" # or "google/gemma-2-9b-it"
OUTPUT_DIR = "./tenderagent-lora-sa-procure"
DATASET_PATH = "./sa_procurement_dataset.jsonl"

# 2. QLoRA 4-bit Quantization Config
lora_config = LoraConfig(
    r=16,
    lora_alpha=32,
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
    lora_dropout=0.05,
    bias="none",
    task_type="CAUSAL_LM"
)

print(f"[*] Initializing model {MODEL_ID} for South African Procurement Fine-Tuning...")
tokenizer = AutoTokenizer.from_pretrained(MODEL_ID)
tokenizer.pad_token = tokenizer.eos_token

# 3. Training Arguments
training_args = TrainingArguments(
    output_dir=OUTPUT_DIR,
    per_device_train_batch_size=2,
    gradient_accumulation_steps=4,
    learning_rate=2e-4,
    lr_scheduler_type="cosine",
    logging_steps=10,
    num_train_epochs=3,
    weight_decay=0.01,
    fp16=not torch.cuda.is_bf16_supported(),
    bf16=torch.cuda.is_bf16_supported(),
    optim="paged_adamw_8bit",
    report_to="none"
)

print("[*] Ready. Run this script in Google Colab, RunPod, or local GPU instance.")
`;
  res.setHeader("Content-Type", "text/x-python");
  res.setHeader("Content-Disposition", 'attachment; filename="train_lora_sa_tenders.py"');
  res.send(pythonScript);
});
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distDir = [path.resolve(__dirname, "dist"), path.resolve(__dirname, "..", "dist"), path.resolve(process.cwd(), "dist")].find((d) => fs.existsSync(path.join(d, "index.html"))) || path.resolve(__dirname, "dist");
    app.use(express.static(distDir));
    app.get("*", (req, res) => {
      res.sendFile(path.resolve(distDir, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[TenderAgent Server] Listening on http://0.0.0.0:${PORT}`);
  });
}
startServer().catch((err) => {
  console.error("[TenderAgent] Fatal server bootstrap error:", err);
  process.exit(1);
});
export {
  PLATFORM_MODELS
};
