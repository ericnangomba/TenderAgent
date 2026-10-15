# 🇿🇦 TenderAgent

> **Hacktoberfest 2026 Open-Source AI Challenge (Week 2: Side Hustle)**  
> An automated, privacy-first compliance framework and bid-response skeleton generator built specifically for South African SMMEs navigating state and corporate procurement.

---

## 🚀 Overview

**TenderAgent** is a micro-SaaS side hustle that levels the procurement playing field for emerging South African contractors. Reading and responding to massive 80+ page government and corporate Request for Proposal (RFP) documents typically requires expensive tender compliance officers. TenderAgent automates this bottleneck using open-source AI.

The platform ingests unstructured tender documents, extracts hyper-local statutory compliance checklists, calculates preferential procurement scoring metrics, and exports formatted bid-response skeletons tailored to local framework demands.

---

## ✨ Key Features

### 🛡️ 1. South African Statutory Compliance Engine (POPIA Sandboxed)
*   **POPIA Compliance Boundary:** Native client-side masking utilities automatically redact South African ID numbers, cellular contacts, and banking identifiers before text chunks hit the LLM core.
*   **CSD Parameter Tracking:** Automatic structural extraction and format verification of National Treasury Central Supplier Database (`MAAA`) identifiers.
*   **SARS TCS Verification:** Isolates tax compliance status mechanisms and tracks third-party verification PIN demands.
*   **B-BBEE Status Recognition:** Identifies target score weighting levels (Levels 1–8) and applies statutory 135% recognition calculations for Level 1 EMEs/QSEs under the **Preferential Procurement Regulations 2022**.
*   **CIDB Designation Mapping:** Automatically flags mandated Construction Industry Development Board constraints (e.g., `7CE`, `6GB PE`).
*   **COIDA Tracking:** Extracts required Compensation Commissioner letters of good standing along with expiration timelines.

### 📊 2. Preference Points System (80/20 vs 90/10) Calculator
Features a programmatic scoring engine running the strict math models dictated by the **Preferential Procurement Policy Framework Act (PPPFA)**. Contractors can compare competitor quotes head-to-head and project precise win probabilities instantly.

### 📝 3. Bid-Response Skeleton Generator
Generates institutional-grade, 4-section procurement response document structures ready for export into editable `.doc / .docx` formats:
1.  **Executive Summary & Statutory Eligibility** (CSD, SARS, B-BBEE, POPIA declarations).
2.  **Technical Approach Framework** (Phases 1–3 execution plans).
3.  **Commercial Presentation & Price Schedule** (Auto-calculates standard **15% ZAR VAT** line items).
4.  **Mandatory Returnable Compliance Index** (Maps out fields for Standard Bidding Documents: **SBD 1, SBD 4, SBD 6.1, SBD 8, and SBD 9**).

### 🤖 4. Local Model Detection & Automatic Cloud Failover
*   **Zero-Config Local Auto-Detection:** Automatically scans local Ollama (`localhost:11434`) and LM Studio (`localhost:1234`) instances for local models like **Gemma 2**, **Llama 3.1 8B**, and **Mistral**.
*   **Automatic Cloud Failover:** If local inference is offline, unconfigured, or encounters latency spikes, requests seamlessly failover to Google Gemini 2.5 Pro / Flash cloud endpoints with real-time health indicator badges.
*   **Local Privacy Mode:** Air-gapped compliance processing ensures strategic pricing and company IP remain strictly on-device.

### 🧠 5. Fine-Tuning Studio (SME Domain Specialization)
*   Provides structured fine-tuning pipelines for South African procurement domain adaptation (PPPFA 2022, CIDB guidelines, SBD 1–9 statutory forms).
*   Generates HuggingFace-compatible JSONL instruction-tuning pairs and exports LoRA / QLoRA training recipes tailored for Gemma 2 (2B/9B) and Llama 3.1 8B.

### 📱 6. Mobile PWA & Offline Support
*   Full **Progressive Web App (PWA)** implementation with install banners, offline service worker caching (`sw.js`), and standalone home-screen launch for Android, iOS Safari, and Desktop.

---

## 🛠️ Tech Stack & Partner Integrations

*   **Orchestration Framework:** [Mastra AI SDK](https://github.com) (Coordinates multi-agent context flow pipelines).
*   **Core LLM Engine:** [Gemma 2](https://google.dev) (Running privately via local instance endpoints to safeguard proprietary strategic corporate IP).
*   **Discovery Layer:** [SerpApi](https://serpapi.com) (Aggregates real-time procurement notifications from state portals and municipal boards).
*   **Observability Platform:** [Sentry Agent Tracing](https://sentry.io) (Monitors discrete async LLM spans and execution thresholds).
*   **Database & Hosting:** MongoDB Atlas & DigitalOcean App Platform.

---

## 📈 Architecture & Observability Tracing

TenderAgent utilizes **Sentry Agent Tracing** to track every operational pipeline lifecycle stage, ensuring absolute transparency during deep context analysis blocks:

```text
[User RFP Upload] 
       │
       ▼
 [popia.sanitize]  ──► (PII Redacted & Sandboxed Locally)
       │
       ▼
 [agent.pipeline]  ──► (Mastra Orchestration Pipeline Fires)
       │
       ├──► [agent.llm.call]        ──► (Gemma 2 Info Extraction)
       ├──► [compliance.evaluate]   ──► (PPPFA Math & SBD Mapping)
       │
       ▼
   [db.mongo]      ──► (Record Indexed to MongoDB Atlas)
```

---

## 🚀 Getting Started

### Prerequisites
*   Node.js 18+
*   MongoDB Atlas cluster connection string
*   Ollama running `gemma2` locally (or an API endpoint provider equivalent)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com
   cd tenderagent
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure your Environment Variables (`.env.local`):
   ```env
   MONGODB_URI=mongodb+srv://...
   SERPAPI_API_KEY=your_serp_api_key_here
   SENTRY_DSN=your_sentry_dsn_here
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   ```

4. Launch the local development pipeline server:
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000/dashboard](http://localhost:3000/dashboard) to view the running control panel application interface.

---

## ⚖️ License & POPIA Statement

Distributed under the MIT License. See `LICENSE` for more details.

*Disclaimer: TenderAgent performs algorithmic scanning and data preparation. All generated SBD documentation fragments should be cross-verified against official National Treasury regulation frameworks before physical submission to an organ of state.*
