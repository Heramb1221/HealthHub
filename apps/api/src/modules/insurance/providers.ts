export interface InsuranceProviderInfo {
  id: string;
  name: string;
  code: string;
  type: "stand_alone_health" | "general_insurer" | "public_sector";
  cashlessHelpline: string;
  customerSupportPhone: string;
  website: string;
  tpaDeskEmail: string;
  popularPlans: string[];
  lastVerified: string;
}

export const INDIAN_INSURANCE_PROVIDERS: InsuranceProviderInfo[] = [
  {
    id: "star-health",
    name: "Star Health and Allied Insurance",
    code: "STAR",
    type: "stand_alone_health",
    cashlessHelpline: "1800 425 2255",
    customerSupportPhone: "1800 102 4477",
    website: "https://www.starhealth.in",
    tpaDeskEmail: "support@starhealth.in",
    popularPlans: ["Star Comprehensive", "Family Health Optima", "Medi Classic", "Senior Citizens Red Carpet"],
    lastVerified: "2026-10-01",
  },
  {
    id: "care-health",
    name: "Care Health Insurance",
    code: "CARE",
    type: "stand_alone_health",
    cashlessHelpline: "1800 102 4488",
    customerSupportPhone: "1800 102 6655",
    website: "https://www.careinsurance.com",
    tpaDeskEmail: "customerfirst@careinsurance.com",
    popularPlans: ["Care Supreme", "Care Advantage (1 Crore)", "Care Heart", "Care Senior"],
    lastVerified: "2026-10-01",
  },
  {
    id: "hdfc-ergo",
    name: "HDFC ERGO General Insurance",
    code: "HDFC_ERGO",
    type: "general_insurer",
    cashlessHelpline: "022 6234 6234",
    customerSupportPhone: "1800 2666 400",
    website: "https://www.hdfcergo.com",
    tpaDeskEmail: "care@hdfcergo.com",
    popularPlans: ["Optima Secure", "Optima Restore", "My:Health Medisure Classic"],
    lastVerified: "2026-10-01",
  },
  {
    id: "icici-lombard",
    name: "ICICI Lombard General Insurance",
    code: "ICICI_LOMBARD",
    type: "general_insurer",
    cashlessHelpline: "1800 2666",
    customerSupportPhone: "1800 2666",
    website: "https://www.icicilombard.com",
    tpaDeskEmail: "customersupport@icicilombard.com",
    popularPlans: ["Complete Health Insurance", "Health AdvantEdge", "Golden Shield Senior"],
    lastVerified: "2026-10-01",
  },
  {
    id: "niva-bupa",
    name: "Niva Bupa Health Insurance",
    code: "NIVA_BUPA",
    type: "stand_alone_health",
    cashlessHelpline: "1860 500 8888",
    customerSupportPhone: "1860 500 8888",
    website: "https://www.nivabupa.com",
    tpaDeskEmail: "customercare@nivabupa.com",
    popularPlans: ["ReAssure 2.0", "Health Companion", "Senior First", "Aspire"],
    lastVerified: "2026-10-01",
  },
  {
    id: "bajaj-allianz",
    name: "Bajaj Allianz General Insurance",
    code: "BAJAJ_ALLIANZ",
    type: "general_insurer",
    cashlessHelpline: "1800 209 5858",
    customerSupportPhone: "1800 209 0144",
    website: "https://www.bajajallianz.com",
    tpaDeskEmail: "bagichelp@bajajallianz.co.in",
    popularPlans: ["Health Guard", "Health Infinity", "Extra Care Plus Top Up"],
    lastVerified: "2026-10-01",
  },
  {
    id: "new-india-assurance",
    name: "The New India Assurance Co. Ltd.",
    code: "NEW_INDIA",
    type: "public_sector",
    cashlessHelpline: "1800 209 1415",
    customerSupportPhone: "1800 209 1415",
    website: "https://www.newindia.co.in",
    tpaDeskEmail: "tech.support@newindia.co.in",
    popularPlans: ["New India Mediclaim", "Arogya Sanjeevani", "Yuva Bharat Health Policy"],
    lastVerified: "2026-10-01",
  },
];
