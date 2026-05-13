import type { LangEntry } from "./StepLanguages";

export type ApplicationDataV2 = {
  job_position_id: string;
  job_title: string;
  custom_position: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  gender: "male" | "female" | "";
  origin_country: string;
  current_address: string;
  current_lat: number | null;
  current_lng: number | null;
  vehicle: "none" | "skate" | "bike" | "car";
  spanish_level: number;
  languages: LangEntry[];
  years_experience: string;
  availability: string;
  shifts: string[];
  cv_file: File | null;
  cv_file_type: "pdf" | "image" | "";
  has_disability: boolean | null;
};

export const INITIAL_V2: ApplicationDataV2 = {
  job_position_id: "",
  job_title: "",
  custom_position: "",
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  gender: "",
  origin_country: "",
  current_address: "",
  current_lat: null,
  current_lng: null,
  vehicle: "none",
  spanish_level: 3,
  languages: [],
  years_experience: "",
  availability: "",
  shifts: [],
  cv_file: null,
  cv_file_type: "",
  has_disability: null,
};
