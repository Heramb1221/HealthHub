import type { FamilyApi } from "@/lib/api/family";
import type {
  AuthUser,
  CreateFamilyMemberInput,
  FamilyMember,
  FamilyRelationship,
  FamilyTreeResult,
  Generation,
  HereditaryRiskSummary,
  UpdateFamilyMemberInput,
} from "@/lib/api/types";
import { currentUser, isSeeded, requirePatient } from "./records";

const key = (userId: string) => `healthhub-demo-family:v1:${userId}`;

const RELATIONSHIP_LABELS: Record<FamilyRelationship, string> = {
  father: "Father",
  mother: "Mother",
  spouse: "Spouse",
  brother: "Brother",
  sister: "Sister",
  son: "Son",
  daughter: "Daughter",
  paternal_grandfather: "Paternal Grandfather (Dad's Father)",
  paternal_grandmother: "Paternal Grandmother (Dad's Mother)",
  maternal_grandfather: "Maternal Grandfather (Mom's Father)",
  maternal_grandmother: "Maternal Grandmother (Mom's Mother)",
  other: "Other Relative",
};

export function getGeneration(rel: FamilyRelationship): Generation {
  switch (rel) {
    case "paternal_grandfather":
    case "paternal_grandmother":
    case "maternal_grandfather":
    case "maternal_grandmother":
      return "grandparents";
    case "father":
    case "mother":
      return "parents";
    case "spouse":
    case "brother":
    case "sister":
      return "current";
    case "son":
    case "daughter":
      return "children";
    default:
      return "other";
  }
}

const SEEDED_MEMBERS: Omit<FamilyMember, "id" | "createdAt" | "updatedAt">[] = [
  {
    fullName: "Ramkrishna Sharma",
    relationship: "paternal_grandfather",
    relationshipLabel: "Paternal Grandfather (Dad's Father)",
    generation: "grandparents",
    vitalStatus: "deceased",
    age: 74,
    bloodGroup: "A+",
    conditions: ["Coronary Artery Disease"],
    notes: "Cardiac bypass surgery at age 62",
  },
  {
    fullName: "Dinanath Verma",
    relationship: "maternal_grandfather",
    relationshipLabel: "Maternal Grandfather (Mom's Father)",
    generation: "grandparents",
    vitalStatus: "deceased",
    age: 79,
    bloodGroup: "O+",
    conditions: ["Type 2 Diabetes", "Hypertension"],
    notes: "Diagnosed with diabetes in his 50s",
  },
  {
    fullName: "Kamla Verma",
    relationship: "maternal_grandmother",
    relationshipLabel: "Maternal Grandmother (Mom's Mother)",
    generation: "grandparents",
    vitalStatus: "alive",
    age: 81,
    bloodGroup: "B+",
    conditions: ["Osteoarthritis"],
    notes: "Under regular mobility and joint physiotherapy",
  },
  {
    fullName: "Rajesh Sharma",
    relationship: "father",
    relationshipLabel: "Father",
    generation: "parents",
    vitalStatus: "alive",
    age: 58,
    bloodGroup: "B+",
    conditions: ["Type 2 Diabetes", "Hypertension"],
    notes: "Managed with Metformin and Telmisartan",
  },
  {
    fullName: "Sunita Sharma",
    relationship: "mother",
    relationshipLabel: "Mother",
    generation: "parents",
    vitalStatus: "alive",
    age: 54,
    bloodGroup: "O+",
    conditions: ["Hypothyroidism"],
    notes: "Daily Thyroxine replacement therapy",
  },
  {
    fullName: "Amit Sharma",
    relationship: "brother",
    relationshipLabel: "Brother",
    generation: "current",
    vitalStatus: "alive",
    age: 26,
    bloodGroup: "B+",
    conditions: [],
    notes: "Active runner, regular health checks clear",
  },
  {
    fullName: "Pooja Sharma",
    relationship: "sister",
    relationshipLabel: "Sister",
    generation: "current",
    vitalStatus: "alive",
    age: 24,
    bloodGroup: "O+",
    conditions: ["Asthma"],
    notes: "Mild seasonal allergic asthma with occasional inhaler",
  },
];

function loadStored(user: AuthUser): FamilyMember[] {
  try {
    const raw = window.localStorage.getItem(key(user.id));
    if (raw) return JSON.parse(raw);
  } catch {
    /* empty */
  }

  if (isSeeded(user)) {
    const initial: FamilyMember[] = SEEDED_MEMBERS.map((m, index) => ({
      ...m,
      id: `seeded-fam-${index + 1}`,
      createdAt: new Date(Date.now() - (index + 1) * 86400000 * 5).toISOString(),
      updatedAt: new Date(Date.now() - (index + 1) * 86400000 * 5).toISOString(),
    }));
    saveStored(user.id, initial);
    return initial;
  }

  return [];
}

function saveStored(userId: string, members: FamilyMember[]) {
  try {
    window.localStorage.setItem(key(userId), JSON.stringify(members));
  } catch {
    /* ignore */
  }
}

function computeTree(members: FamilyMember[]): FamilyTreeResult {
  const generations = {
    grandparents: [] as FamilyMember[],
    parents: [] as FamilyMember[],
    current: [] as FamilyMember[],
    children: [] as FamilyMember[],
    other: [] as FamilyMember[],
  };

  const riskMap = new Map<string, { name: string; relationship: string; relationLabel: string }[]>();

  for (const m of members) {
    const gen = m.generation || getGeneration(m.relationship);
    if (generations[gen]) {
      generations[gen].push(m);
    } else {
      generations.other.push(m);
    }

    for (const condition of m.conditions) {
      const trimmed = condition.trim();
      if (!trimmed) continue;
      const key = trimmed.toLowerCase();
      const existing = riskMap.get(key) || [];
      existing.push({
        name: m.fullName,
        relationship: m.relationship,
        relationLabel: m.relationshipLabel,
      });
      riskMap.set(key, existing);
    }
  }

  const hereditaryRisks: HereditaryRiskSummary[] = Array.from(riskMap.entries())
    .map(([rawKey, list]) => ({
      condition: list[0]?.name ? rawKey.replace(/\b\w/g, (c) => c.toUpperCase()) : rawKey,
      count: list.length,
      members: list,
    }))
    .sort((a, b) => b.count - a.count || a.condition.localeCompare(b.condition));

  return {
    data: members,
    generations,
    hereditaryRisks,
    totalMembers: members.length,
  };
}

export const demoFamilyApi: FamilyApi = {
  async list(): Promise<FamilyTreeResult> {
    const user = await currentUser();
    requirePatient(user);
    const members = loadStored(user);
    return computeTree(members);
  },

  async create(input: CreateFamilyMemberInput): Promise<FamilyMember> {
    const user = await currentUser();
    requirePatient(user);
    const members = loadStored(user);
    const gen = getGeneration(input.relationship);

    const newMember: FamilyMember = {
      id: `fam-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      fullName: input.fullName.trim(),
      relationship: input.relationship,
      relationshipLabel: RELATIONSHIP_LABELS[input.relationship] ?? input.relationship,
      generation: gen,
      vitalStatus: input.vitalStatus ?? "alive",
      age: input.age ?? null,
      bloodGroup: input.bloodGroup ?? null,
      conditions: (input.conditions || []).map((c) => c.trim()).filter(Boolean),
      notes: input.notes?.trim() || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    members.push(newMember);
    saveStored(user.id, members);
    return newMember;
  },

  async update(id: string, input: UpdateFamilyMemberInput): Promise<FamilyMember> {
    const user = await currentUser();
    requirePatient(user);
    const members = loadStored(user);
    const index = members.findIndex((m) => m.id === id);
    if (index === -1) {
      throw new Error("Family member not found");
    }

    const current = members[index];
    const rel = input.relationship ?? current.relationship;
    const updated: FamilyMember = {
      ...current,
      fullName: input.fullName !== undefined ? input.fullName.trim() : current.fullName,
      relationship: rel,
      relationshipLabel: RELATIONSHIP_LABELS[rel] ?? rel,
      generation: getGeneration(rel),
      vitalStatus: input.vitalStatus ?? current.vitalStatus,
      age: input.age !== undefined ? input.age : current.age,
      bloodGroup: input.bloodGroup !== undefined ? input.bloodGroup : current.bloodGroup,
      conditions: input.conditions !== undefined ? input.conditions.map((c) => c.trim()).filter(Boolean) : current.conditions,
      notes: input.notes !== undefined ? input.notes?.trim() || null : current.notes,
      updatedAt: new Date().toISOString(),
    };

    members[index] = updated;
    saveStored(user.id, members);
    return updated;
  },

  async remove(id: string): Promise<{ success: boolean; deletedId: string }> {
    const user = await currentUser();
    requirePatient(user);
    let members = loadStored(user);
    members = members.filter((m) => m.id !== id);
    saveStored(user.id, members);
    return { success: true, deletedId: id };
  },
};
