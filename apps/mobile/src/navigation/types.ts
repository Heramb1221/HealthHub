import type { NavigatorScreenParams } from "@react-navigation/native";

export type AuthStackParamList = {
  Welcome: undefined;
  SignIn: undefined;
  Register: undefined;
};

export type TabParamList = {
  Home: undefined;
  Prescriptions: undefined;
  Medicines: undefined;
  Care: undefined;
  Profile: undefined;
};

export type RootStackParamList = {
  Tabs: NavigatorScreenParams<TabParamList>;
  PrescriptionUpload: undefined;
  PrescriptionDetail: { id: string };
  History: undefined;
  HealthCard: undefined;
  Hospital: { id: string };
};
