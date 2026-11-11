# 🇿🇦 TenderAgent

> An automated, privacy-first compliance framework and bid-response skeleton generator built specifically for South African SMMEs navigating state and corporate procurement.

---

## 🚀 Overview

**TenderAgent** is a micro-SaaS side hustle that levels the procurement playing field for emerging South African contractors. Reading and responding to massive 80+ page government and corporate Request for Proposal (RFP) documents typically requires expensive tender compliance officers. TenderAgent automates this bottleneck using open-source AI.

The platform ingests unstructured tender documents, extracts hyper-local statutory compliance checklists, calculates preferential procurement scoring metrics, and exports formatted bid-response skeletons tailored to local framework demands.

---

## ✨ Key Features

### 🛡️ 1. South African Tender Requirements
*   **Limited text redaction:** The server masks 13-16 digit ID/card-like runs, email addresses, SA phone numbers in contiguous, spaced or +27 forms, and VAT-like numbers before model processing. Names, physical addresses, dash-separated local phone numbers and other private details can remain. This is not POPIA certification or clearance to upload confidential documents.
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

### 🤖 4. Server-Side Models and Gated Cloud Fallback
*   **Local runner detection:** Operator-only checks probe Ollama (`localhost:11434`) and LM Studio (`localhost:1234`) on the application server. A configured model label is not proof that a model is running.
*   **Cloud fallback:** Gemini calls require server configuration and a signed-in account with active entitlement and remaining allowance. They are not unconditional. Public health on 11 November 2026 reported Gemini not configured; redacted text can still contain private details if cloud processing is enabled later.
*   **Hosted processing, not on-device isolation:** Uploads reach the application server. A local model means local to that server, not the customer's device. Saved profiles and bid drafts use the configured database. Do not describe the hosted service as air-gapped or South-African-only storage. See [data lifecycle and release limits](docs/DATA_LIFECYCLE.md).

### 🧠 5. Operator Fine-Tuning Studio Preview
*   Dataset and training-job controls are operator-only. Training, comparison and deployment screens are simulations, not evidence that a GPU job ran or that an adapter was produced or deployed.
*   The studio can prepare instruction examples and export a Python training recipe for separately operated training. Generated examples must remain tenant-owned; public sample datasets must not receive private tender metadata.

### 📱 6. Mobile PWA & Offline Support
*   Full **Progressive Web App (PWA)** implementation with install banners, offline service worker caching (`sw.js`), and standalone home-screen launch for Android, iOS Safari, and Desktop.

---

## 🛠️ Current Deployment and Optional Integrations

Observed on 11 November 2026, not a permanent hosting guarantee:

* **Frontend:** Netlify, https://tenderagent1.netlify.app/ .
* **Backend:** Node/Express container on the owner's VM through Coolify; only the TenderAgent service is exposed through Tailscale Funnel.
* **Database:** `STORE=postgres` using Neon. The project console showed AWS US East 2 (Ohio), Free plan, one production branch and six-hour point-in-time history. No snapshots or snapshot schedule were set. That history window is not a deadline for erasing every backup copy.
* **Models:** Server-side loopback runners or deterministic fallback. Gemini is an optional, configuration- and entitlement-gated external provider, not currently configured in the observed deployment.
* **Discovery:** SerpApi calls are gated by account entitlement and allowance; otherwise the service uses labelled samples.
* **Tracing:** The pipeline produces local trace records. Sentry exception reporting is optional when `SENTRY_DSN` is configured; observed public health reported it off. Trace labels alone do not prove external observability is active.
* **Alternate storage:** MongoDB is supported through `STORE=mongo`; legacy connected Mongo code persisted analysis records through `TenderModel`; the no-history candidate stops new analysis writes but does not purge old rows. MongoDB Atlas and DigitalOcean were earlier architecture choices, not the current deployed database/host.

## 📈 Hosted Data Flow and Limits

```text
Customer browser uploads tender text or a document
    -> Application server parses text and applies limited pattern redaction
    -> Server-side runner / deterministic fallback
       (optional external Gemini only when configured and authorized)
    -> Extracted requirements and response skeleton returned to browser
    -> Prepared no-history rule: analysis fields + redacted excerpt are
       returned in this response only, not stored as analysis history
    -> Explicitly saved profiles and bid drafts/notes persist in Postgres
```

Older code could store analyses in the alternate connected Mongo tender collection. The prepared no-history pipeline does not write new analyses to that collection or the process Map; it does not purge legacy Mongo rows. Profile/draft deletion does not delete an entire account or provider backups. Names, physical addresses and other private text can survive redaction. API responses are network-only in the service worker; static shell caching is not offline access to private account data. See [the lifecycle inventory](docs/DATA_LIFECYCLE.md) for account-deletion support limits and unresolved backup/restore controls. Confidential-upload clearance is not claimed.

---

## 🚀 Getting Started

### Prerequisites
* Node.js 22 (matches the deployment image).
* For local development, the default in-memory store needs no database. Persistent deployments require Postgres (`STORE=postgres`, `DATABASE_URL`) or Mongo (`STORE=mongo`, `MONGODB_URI`).
* Local model runners and paid provider keys are optional. Do not enable external services or use confidential documents merely to try the app.

### Installation

```bash
git clone https://github.com/ericnangomba/TenderAgent
cd TenderAgent
npm ci
npm run dev
```

The default local server listens on port 3001. Configure account guards with `AUTH_REQUIRED=true`. Do not copy development secrets into a public repository. Persistent production requires the storage/auth configuration enforced in `src/lib/server/config.ts`; sensitive profile PIN encryption requires a privately managed `PROFILE_FIELD_KEY`. Follow the controlled deployment/key procedure rather than generating or pasting secrets in documentation.

---

## ⚖️ License & POPIA Statement

Distributed under the MIT License. See `LICENSE` for more details.

*Disclaimer: TenderAgent performs algorithmic scanning and data preparation. All generated SBD documentation fragments should be cross-verified against official National Treasury regulation frameworks before physical submission to an organ of state.*

### Account-erasure rollout gate

The prepared whole-account erasure capability is local/test-only. `ACCOUNT_DELETION_ENABLED` defaults false; production refuses startup with it true until durable deletion/restore reconciliation is implemented and reviewed. With deletion off, its UI/API capability and new tenant-FK migration are disabled, while response-only analyses and tenant-isolation mitigations remain active. See `docs/DATA_LIFECYCLE.md` for the split and unresolved recovery-copy limits. No existing account is deleted by deployment.
