export type VaccineCategory = "uip" | "iap_private" | "covid19" | "special_travel" | "custom";

export interface VaccineCatalogItem {
  id: string;
  name: string;
  category: VaccineCategory;
  categoryLabel: string;
  description: string;
}

export const VACCINE_CATEGORIES: { id: VaccineCategory | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "uip", label: "UIP Routine" },
  { id: "iap_private", label: "IAP & Private" },
  { id: "covid19", label: "COVID-19" },
  { id: "special_travel", label: "Special & Travel" },
  { id: "custom", label: "Other" },
];

export const VACCINE_CATALOG: VaccineCatalogItem[] = [
  // 1. Universal Immunization Programme (UIP) — Government Routine Vaccines
  {
    id: "bcg",
    name: "Bacillus Calmette–Guérin (BCG)",
    category: "uip",
    categoryLabel: "Universal Immunization Programme (UIP)",
    description: "Prevents severe childhood Tuberculosis (TB).",
  },
  {
    id: "opv",
    name: "Oral Polio Vaccine (OPV & Bivalent OPV)",
    category: "uip",
    categoryLabel: "Universal Immunization Programme (UIP)",
    description: "Prevents poliomyelitis (administered as zero-dose at birth and subsequent booster/bivalent drops).",
  },
  {
    id: "ipv",
    name: "Inactivated Polio Vaccine (IPV / fIPV)",
    category: "uip",
    categoryLabel: "Universal Immunization Programme (UIP)",
    description: "Fractional intradermal or intramuscular injectable polio vaccine.",
  },
  {
    id: "hepb",
    name: "Hepatitis B",
    category: "uip",
    categoryLabel: "Universal Immunization Programme (UIP)",
    description: "Prevents viral hepatitis B (birth dose and part of combination shots).",
  },
  {
    id: "pentavalent",
    name: "Pentavalent Vaccine",
    category: "uip",
    categoryLabel: "Universal Immunization Programme (UIP)",
    description: "A single combination shot covering Diphtheria, Pertussis (Whooping Cough), Tetanus, Hepatitis B, and Haemophilus influenzae type b (Hib).",
  },
  {
    id: "rvv",
    name: "Rotavirus Vaccine (RVV)",
    category: "uip",
    categoryLabel: "Universal Immunization Programme (UIP)",
    description: "Oral drops preventing severe infant rotavirus diarrhea.",
  },
  {
    id: "pcv",
    name: "Pneumococcal Conjugate Vaccine (PCV)",
    category: "uip",
    categoryLabel: "Universal Immunization Programme (UIP)",
    description: "Protects against invasive pneumococcal diseases like pneumonia, otitis media, and meningitis.",
  },
  {
    id: "mr",
    name: "Measles and Rubella (MR) Vaccine",
    category: "uip",
    categoryLabel: "Universal Immunization Programme (UIP)",
    description: "Combined shot targeting measles and rubella viruses (expanded to MMR in various regions/private sectors).",
  },
  {
    id: "je",
    name: "Japanese Encephalitis (JE) Vaccine",
    category: "uip",
    categoryLabel: "Universal Immunization Programme (UIP)",
    description: "Administered selectively in high-endemic districts.",
  },
  {
    id: "dpt_booster",
    name: "DPT Booster",
    category: "uip",
    categoryLabel: "Universal Immunization Programme (UIP)",
    description: "Early childhood and school-age booster shots for Diphtheria, Pertussis, and Tetanus.",
  },
  {
    id: "td",
    name: "Td (Tetanus and adult Diphtheria)",
    category: "uip",
    categoryLabel: "Universal Immunization Programme (UIP)",
    description: "Adolescent and adult booster vaccine given at ages 10 and 16, and routinely for pregnant women.",
  },

  // 2. Indian Academy of Pediatrics (IAP) & Private Healthcare Recommendations
  {
    id: "mmr",
    name: "MMR (Measles, Mumps, Rubella)",
    category: "iap_private",
    categoryLabel: "IAP & Private Healthcare Recommendations",
    description: "Replaces or supplements standard MR vaccine to provide explicit protection against mumps.",
  },
  {
    id: "tcv",
    name: "Typhoid Conjugate Vaccine (TCV)",
    category: "iap_private",
    categoryLabel: "IAP & Private Healthcare Recommendations",
    description: "Superior long-lasting protection against typhoid fever, typically given around 9–12 months with boosters.",
  },
  {
    id: "hepa",
    name: "Hepatitis A Vaccine",
    category: "iap_private",
    categoryLabel: "IAP & Private Healthcare Recommendations",
    description: "Two-dose regimen protecting against HAV-driven liver infections.",
  },
  {
    id: "varicella",
    name: "Varicella Vaccine",
    category: "iap_private",
    categoryLabel: "IAP & Private Healthcare Recommendations",
    description: "Protects against chickenpox and its complications.",
  },
  {
    id: "flu",
    name: "Influenza (Flu) Vaccine",
    category: "iap_private",
    categoryLabel: "IAP & Private Healthcare Recommendations",
    description: "Quadrivalent/trivalent annual shots protecting against shifting seasonal influenza strains.",
  },
  {
    id: "hpv",
    name: "Human Papillomavirus (HPV) Vaccine",
    category: "iap_private",
    categoryLabel: "IAP & Private Healthcare Recommendations",
    description: "Gardasil/Cervarix types protecting pre-teens and young adults against cervical, anal, and throat cancers linked to HPV.",
  },

  // 3. COVID-19 Vaccines Approved in India
  {
    id: "covishield",
    name: "Covishield",
    category: "covid19",
    categoryLabel: "COVID-19 Vaccines Approved in India",
    description: "Oxford-AstraZeneca viral vector vaccine manufactured by Serum Institute of India.",
  },
  {
    id: "covaxin",
    name: "Covaxin",
    category: "covid19",
    categoryLabel: "COVID-19 Vaccines Approved in India",
    description: "Whole-virion inactivated Vero cell vaccine developed by Bharat Biotech.",
  },
  {
    id: "corbevax",
    name: "Corbevax",
    category: "covid19",
    categoryLabel: "COVID-19 Vaccines Approved in India",
    description: "Protein subunit vaccine manufactured by Biological E.",
  },
  {
    id: "covovax",
    name: "Covovax",
    category: "covid19",
    categoryLabel: "COVID-19 Vaccines Approved in India",
    description: "Protein subunit vaccine produced by the Serum Institute of India.",
  },
  {
    id: "incovacc",
    name: "iNCOVACC",
    category: "covid19",
    categoryLabel: "COVID-19 Vaccines Approved in India",
    description: "Intranasal replication-deficient adenoviral vector vaccine developed by Bharat Biotech.",
  },
  {
    id: "sputnik",
    name: "Sputnik V / Sputnik Light",
    category: "covid19",
    categoryLabel: "COVID-19 Vaccines Approved in India",
    description: "Viral vector vaccines approved for emergency use.",
  },
  {
    id: "zycov_d",
    name: "ZyCoV-D",
    category: "covid19",
    categoryLabel: "COVID-19 Vaccines Approved in India",
    description: "Plasmid DNA vaccine developed by Zydus Cadila.",
  },
  {
    id: "gemcovac_om",
    name: "Gemcovac-OM",
    category: "covid19",
    categoryLabel: "COVID-19 Vaccines Approved in India",
    description: "Indigenously developed Omicron-adapted mRNA booster.",
  },

  // 4. Travel, Outbreak, and High-Risk Special Vaccines
  {
    id: "yellow_fever",
    name: "Yellow Fever Vaccine",
    category: "special_travel",
    categoryLabel: "Travel, Outbreak & High-Risk Vaccines",
    description: "Legally mandated for international travelers entering India from endemic zones or traveling outward to them.",
  },
  {
    id: "meningococcal",
    name: "Meningococcal Vaccine",
    category: "special_travel",
    categoryLabel: "Travel, Outbreak & High-Risk Vaccines",
    description: "Protects against Neisseria meningitidis; mandatory for certain international pilgrims (like Hajj) and recommended for high-density hostel residents.",
  },
  {
    id: "cholera",
    name: "Oral Cholera Vaccine (OCV)",
    category: "special_travel",
    categoryLabel: "Travel, Outbreak & High-Risk Vaccines",
    description: "Used during flood relief operations or localized outbreaks.",
  },
  {
    id: "rabies",
    name: "Rabies Vaccine",
    category: "special_travel",
    categoryLabel: "Travel, Outbreak & High-Risk Vaccines",
    description: "Used proactively for animal handlers (pre-exposure) or immediately following animal bites (post-exposure).",
  },
  {
    id: "ppsv23",
    name: "Pneumococcal Polysaccharide Vaccine (PPSV23)",
    category: "special_travel",
    categoryLabel: "Travel, Outbreak & High-Risk Vaccines",
    description: "Prescribed for high-risk adults, chronic illness patients, and senior citizens aged 65+.",
  },
  {
    id: "zoster",
    name: "Zoster Vaccine (Shingles)",
    category: "special_travel",
    categoryLabel: "Travel, Outbreak & High-Risk Vaccines",
    description: "Recommended for adults over 50 to prevent shingles flare-ups and post-herpetic neuralgia.",
  },
];
