export type ResearchStatus =
  | "DRAFT" | "SUBMITTED" | "UNDER_REVIEW" | "APPROVED"
  | "ACTIVE" | "REJECTED" | "COMPLETED" | "CANCELLED";

export type ResearchCategory = {
  id: string;
  name: string;
  description: string;
};

export type ResearchProject = {
  id: string;
  country_key: string;
  title: string;
  category_id: string;
  description: string;
  objective: string;
  prerequisites: string;
  status: ResearchStatus;
  initial_investment: number;
  total_investment: number;
  approved_duration_days: number | null;
  submitted_world_date: string | null;
  started_world_date: string | null;
  scheduled_completion_world_date: string | null;
  completed_world_date: string | null;
  rejection_reason: string | null;
};

export type ResearchOverview = {
  countryKey: string;
  worldDate: string;
  balance: number;
  incomePerPeriod: number;
  researchCapacity: number;
  categories: ResearchCategory[];
  projects: ResearchProject[];
};

export type InvestmentPreview = {
  amount: number;
  currentCompletionDate: string;
  projectedCompletionDate: string;
  balanceAfter: number;
};
