import type { VaccinationsApi } from "@/lib/api/vaccinations";
import type { PatientVaccination, RecordVaccinationInput } from "@/lib/api/types";
import { currentUser, isSeeded, requirePatient } from "./records";

interface StoredVaccination {
  vaccineName: string;
  vaccineId?: string | null;
  category?: string;
  status: "taken" | "not_taken";
  administeredDate?: string | null;
  notes?: string | null;
  updatedAt: string;
}

const key = (userId: string) => `healthhub-demo-vaccinations:v1:${userId}`;

function loadStored(userId: string): Record<string, StoredVaccination> {
  try {
    const raw = window.localStorage.getItem(key(userId));
    if (raw) return JSON.parse(raw);
  } catch {

  }
  return {};
}

function saveStored(userId: string, data: Record<string, StoredVaccination>) {
  try {
    window.localStorage.setItem(key(userId), JSON.stringify(data));
  } catch {

  }
}

const DIRECTORY: (Omit<PatientVaccination, "recordId" | "status" | "administeredDate" | "notes" | "updatedAt" | "isCustom"> & { id: string })[] = [

  { id: "bcg", vaccineId: "bcg", vaccineName: "Bacillus Calmette–Guérin (BCG)", category: "uip", categoryLabel: "Universal Immunization Programme (UIP)", description: "Prevents severe childhood Tuberculosis (TB)." },
  { id: "opv", vaccineId: "opv", vaccineName: "Oral Polio Vaccine (OPV & Bivalent OPV)", category: "uip", categoryLabel: "Universal Immunization Programme (UIP)", description: "Prevents poliomyelitis (administered as zero-dose at birth and subsequent booster/bivalent drops)." },
  { id: "ipv", vaccineId: "ipv", vaccineName: "Inactivated Polio Vaccine (IPV / fIPV)", category: "uip", categoryLabel: "Universal Immunization Programme (UIP)", description: "Fractional intradermal or intramuscular injectable polio vaccine." },
  { id: "hepb", vaccineId: "hepb", vaccineName: "Hepatitis B", category: "uip", categoryLabel: "Universal Immunization Programme (UIP)", description: "Prevents viral hepatitis B (birth dose and part of combination shots)." },
  { id: "pentavalent", vaccineId: "pentavalent", vaccineName: "Pentavalent Vaccine", category: "uip", categoryLabel: "Universal Immunization Programme (UIP)", description: "A single combination shot covering Diphtheria, Pertussis (Whooping Cough), Tetanus, Hepatitis B, and Haemophilus influenzae type b (Hib)." },
  { id: "rvv", vaccineId: "rvv", vaccineName: "Rotavirus Vaccine (RVV)", category: "uip", categoryLabel: "Universal Immunization Programme (UIP)", description: "Oral drops preventing severe infant rotavirus diarrhea." },
  { id: "pcv", vaccineId: "pcv", vaccineName: "Pneumococcal Conjugate Vaccine (PCV)", category: "uip", categoryLabel: "Universal Immunization Programme (UIP)", description: "Protects against invasive pneumococcal diseases like pneumonia, otitis media, and meningitis." },
  { id: "mr", vaccineId: "mr", vaccineName: "Measles and Rubella (MR) Vaccine", category: "uip", categoryLabel: "Universal Immunization Programme (UIP)", description: "Combined shot targeting measles and rubella viruses (expanded to MMR in various regions/private sectors)." },
  { id: "je", vaccineId: "je", vaccineName: "Japanese Encephalitis (JE) Vaccine", category: "uip", categoryLabel: "Universal Immunization Programme (UIP)", description: "Administered selectively in high-endemic districts." },
  { id: "dpt_booster", vaccineId: "dpt_booster", vaccineName: "DPT Booster", category: "uip", categoryLabel: "Universal Immunization Programme (UIP)", description: "Early childhood and school-age booster shots for Diphtheria, Pertussis, and Tetanus." },
  { id: "td", vaccineId: "td", vaccineName: "Td (Tetanus and adult Diphtheria)", category: "uip", categoryLabel: "Universal Immunization Programme (UIP)", description: "Adolescent and adult booster vaccine given at ages 10 and 16, and routinely for pregnant women." },

  { id: "mmr", vaccineId: "mmr", vaccineName: "MMR (Measles, Mumps, Rubella)", category: "iap_private", categoryLabel: "IAP & Private Healthcare Recommendations", description: "Replaces or supplements standard MR vaccine to provide explicit protection against mumps." },
  { id: "tcv", vaccineId: "tcv", vaccineName: "Typhoid Conjugate Vaccine (TCV)", category: "iap_private", categoryLabel: "IAP & Private Healthcare Recommendations", description: "Superior long-lasting protection against typhoid fever, typically given around 9–12 months with boosters." },
  { id: "hepa", vaccineId: "hepa", vaccineName: "Hepatitis A Vaccine", category: "iap_private", categoryLabel: "IAP & Private Healthcare Recommendations", description: "Two-dose regimen protecting against HAV-driven liver infections." },
  { id: "varicella", vaccineId: "varicella", vaccineName: "Varicella Vaccine", category: "iap_private", categoryLabel: "IAP & Private Healthcare Recommendations", description: "Protects against chickenpox and its complications." },
  { id: "flu", vaccineId: "flu", vaccineName: "Influenza (Flu) Vaccine", category: "iap_private", categoryLabel: "IAP & Private Healthcare Recommendations", description: "Quadrivalent/trivalent annual shots protecting against shifting seasonal influenza strains." },
  { id: "hpv", vaccineId: "hpv", vaccineName: "Human Papillomavirus (HPV) Vaccine", category: "iap_private", categoryLabel: "IAP & Private Healthcare Recommendations", description: "Gardasil/Cervarix types protecting pre-teens and young adults against cervical, anal, and throat cancers linked to HPV." },

  { id: "covishield", vaccineId: "covishield", vaccineName: "Covishield", category: "covid19", categoryLabel: "COVID-19 Vaccines Approved in India", description: "Oxford-AstraZeneca viral vector vaccine manufactured by Serum Institute of India." },
  { id: "covaxin", vaccineId: "covaxin", vaccineName: "Covaxin", category: "covid19", categoryLabel: "COVID-19 Vaccines Approved in India", description: "Whole-virion inactivated Vero cell vaccine developed by Bharat Biotech." },
  { id: "corbevax", vaccineId: "corbevax", vaccineName: "Corbevax", category: "covid19", categoryLabel: "COVID-19 Vaccines Approved in India", description: "Protein subunit vaccine manufactured by Biological E." },
  { id: "covovax", vaccineId: "covovax", vaccineName: "Covovax", category: "covid19", categoryLabel: "COVID-19 Vaccines Approved in India", description: "Protein subunit vaccine produced by the Serum Institute of India." },
  { id: "incovacc", vaccineId: "incovacc", vaccineName: "iNCOVACC", category: "covid19", categoryLabel: "COVID-19 Vaccines Approved in India", description: "Intranasal replication-deficient adenoviral vector vaccine developed by Bharat Biotech." },
  { id: "sputnik", vaccineId: "sputnik", vaccineName: "Sputnik V / Sputnik Light", category: "covid19", categoryLabel: "COVID-19 Vaccines Approved in India", description: "Viral vector vaccines approved for emergency use." },
  { id: "zycov_d", vaccineId: "zycov_d", vaccineName: "ZyCoV-D", category: "covid19", categoryLabel: "COVID-19 Vaccines Approved in India", description: "Plasmid DNA vaccine developed by Zydus Cadila." },
  { id: "gemcovac_om", vaccineId: "gemcovac_om", vaccineName: "Gemcovac-OM", category: "covid19", categoryLabel: "COVID-19 Vaccines Approved in India", description: "Indigenously developed Omicron-adapted mRNA booster." },

  { id: "yellow_fever", vaccineId: "yellow_fever", vaccineName: "Yellow Fever Vaccine", category: "special_travel", categoryLabel: "Travel, Outbreak & High-Risk Vaccines", description: "Legally mandated for international travelers entering India from endemic zones or traveling outward to them." },
  { id: "meningococcal", vaccineId: "meningococcal", vaccineName: "Meningococcal Vaccine", category: "special_travel", categoryLabel: "Travel, Outbreak & High-Risk Vaccines", description: "Protects against Neisseria meningitidis; mandatory for certain international pilgrims (like Hajj) and recommended for high-density hostel residents." },
  { id: "cholera", vaccineId: "cholera", vaccineName: "Oral Cholera Vaccine (OCV)", category: "special_travel", categoryLabel: "Travel, Outbreak & High-Risk Vaccines", description: "Used during flood relief operations or localized outbreaks." },
  { id: "rabies", vaccineId: "rabies", vaccineName: "Rabies Vaccine", category: "special_travel", categoryLabel: "Travel, Outbreak & High-Risk Vaccines", description: "Used proactively for animal handlers (pre-exposure) or immediately following animal bites (post-exposure)." },
  { id: "ppsv23", vaccineId: "ppsv23", vaccineName: "Pneumococcal Polysaccharide Vaccine (PPSV23)", category: "special_travel", categoryLabel: "Travel, Outbreak & High-Risk Vaccines", description: "Prescribed for high-risk adults, chronic illness patients, and senior citizens aged 65+." },
  { id: "zoster", vaccineId: "zoster", vaccineName: "Zoster Vaccine (Shingles)", category: "special_travel", categoryLabel: "Travel, Outbreak & High-Risk Vaccines", description: "Recommended for adults over 50 to prevent shingles flare-ups and post-herpetic neuralgia." },
];

export const demoVaccinationsApi: VaccinationsApi = {
  async list(query) {
    const user = await currentUser();
    requirePatient(user);

    const stored = loadStored(user.id);

    if (Object.keys(stored).length === 0 && isSeeded(user)) {
      stored["bcg"] = { vaccineName: "Bacillus Calmette–Guérin (BCG)", vaccineId: "bcg", category: "uip", status: "taken", administeredDate: "1995-04-10", notes: "Childhood routine", updatedAt: new Date().toISOString() };
      stored["opv"] = { vaccineName: "Oral Polio Vaccine (OPV & Bivalent OPV)", vaccineId: "opv", category: "uip", status: "taken", administeredDate: "1995-04-10", notes: "Pulse Polio routine", updatedAt: new Date().toISOString() };
      stored["covishield"] = { vaccineName: "Covishield", vaccineId: "covishield", category: "covid19", status: "taken", administeredDate: "2021-06-15", notes: "Both doses completed", updatedAt: new Date().toISOString() };
      stored["td"] = { vaccineName: "Td (Tetanus and adult Diphtheria)", vaccineId: "td", category: "uip", status: "taken", administeredDate: "2023-01-12", notes: "Booster dose", updatedAt: new Date().toISOString() };
      saveStored(user.id, stored);
    }

    const items: PatientVaccination[] = [];
    const matchedKeys = new Set<string>();

    for (const dir of DIRECTORY) {
      const entry = stored[dir.vaccineName.toLowerCase()] ?? (dir.vaccineId ? stored[dir.vaccineId] : undefined);
      if (entry) {
        matchedKeys.add(entry.vaccineName.toLowerCase());
        if (dir.vaccineId) matchedKeys.add(dir.vaccineId);
      }

      items.push({
        recordId: entry ? `demo-${dir.vaccineId ?? dir.vaccineName}` : null,
        vaccineId: dir.vaccineId,
        vaccineName: dir.vaccineName,
        category: dir.category,
        categoryLabel: dir.categoryLabel,
        description: dir.description,
        status: entry?.status ?? null,
        administeredDate: entry?.administeredDate ?? null,
        notes: entry?.notes ?? null,
        isCustom: false,
        updatedAt: entry?.updatedAt ?? null,
      });
    }

    for (const [key, val] of Object.entries(stored)) {
      if (!matchedKeys.has(key) && !matchedKeys.has(val.vaccineName.toLowerCase())) {
        items.push({
          recordId: `demo-custom-${val.vaccineName}`,
          vaccineId: val.vaccineId ?? null,
          vaccineName: val.vaccineName,
          category: (val.category as PatientVaccination["category"]) || "custom",
          categoryLabel: "Other Vaccines",
          description: val.notes || "Self-reported vaccine record.",
          status: val.status,
          administeredDate: val.administeredDate ?? null,
          notes: val.notes ?? null,
          isCustom: true,
          updatedAt: val.updatedAt,
        });
      }
    }

    let filtered = items;
    if (query?.category) filtered = filtered.filter((i) => i.category === query.category);
    if (query?.status) filtered = filtered.filter((i) => i.status === query.status);

    return {
      data: filtered,
      summary: {
        total: items.length,
        taken: items.filter((i) => i.status === "taken").length,
        notTaken: items.filter((i) => i.status === "not_taken").length,
        unrecorded: items.filter((i) => i.status === null).length,
      },
    };
  },

  async record(input: RecordVaccinationInput) {
    const user = await currentUser();
    requirePatient(user);

    const stored = loadStored(user.id);
    const keyToUse = (input.vaccineId || input.vaccineName).toLowerCase();
    const now = new Date().toISOString();

    const dirMatch = DIRECTORY.find(
      (d) => d.vaccineName.toLowerCase() === input.vaccineName.toLowerCase() || (input.vaccineId && d.vaccineId === input.vaccineId),
    );

    const updated: StoredVaccination = {
      vaccineName: dirMatch ? dirMatch.vaccineName : input.vaccineName,
      vaccineId: dirMatch ? dirMatch.vaccineId : input.vaccineId,
      category: dirMatch ? dirMatch.category : input.category || "custom",
      status: input.status,
      administeredDate: input.administeredDate,
      notes: input.notes,
      updatedAt: now,
    };

    stored[keyToUse] = updated;
    stored[updated.vaccineName.toLowerCase()] = updated;
    saveStored(user.id, stored);

    return {
      recordId: `demo-${updated.vaccineName}`,
      vaccineId: updated.vaccineId ?? null,
      vaccineName: updated.vaccineName,
      category: (updated.category as PatientVaccination["category"]) || "custom",
      categoryLabel: dirMatch ? dirMatch.categoryLabel : "Other Vaccines",
      description: dirMatch ? dirMatch.description : (updated.notes ?? "Self-reported vaccine record."),
      status: updated.status,
      administeredDate: updated.administeredDate ?? null,
      notes: updated.notes ?? null,
      isCustom: !dirMatch,
      updatedAt: now,
    };
  },

  async remove(vaccineName: string) {
    const user = await currentUser();
    requirePatient(user);

    const stored = loadStored(user.id);
    const lower = vaccineName.toLowerCase();
    delete stored[lower];
    for (const [k, v] of Object.entries(stored)) {
      if (v.vaccineName.toLowerCase() === lower || v.vaccineId?.toLowerCase() === lower) {
        delete stored[k];
      }
    }
    saveStored(user.id, stored);
    return { success: true, clearedVaccine: vaccineName };
  },
};
