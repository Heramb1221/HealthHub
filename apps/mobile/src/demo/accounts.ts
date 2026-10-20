
export interface DemoAccount {
  id: "patient" | "google" | "apple";
  label: string;
  email: string;
  password: string;
}

const DEMO_PASSWORD = "DemoPatient#1";

export const DEMO_ACCOUNTS: Record<DemoAccount["id"], DemoAccount> = {
  patient: { id: "patient", label: "Demo patient", email: "demo.patient@healthhub.test", password: DEMO_PASSWORD },
  google: { id: "google", label: "Google (demo sandbox)", email: "alex.chen@healthhub.test", password: DEMO_PASSWORD },
  apple: { id: "apple", label: "Apple (demo sandbox)", email: "alex.chen@privaterelay.appleid.com", password: DEMO_PASSWORD },
};

export function demoNameFor(email: string): string {
  return email.startsWith("alex.chen@") ? "Alex Chen" : "Asha Demo";
}
