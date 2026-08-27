export type FactionMembershipStatus = "member" | "observer";

export type FactionMembership = {
  factionId: string;
  status: FactionMembershipStatus;
};

export type FactionMapLabelPath = {
  start: { x: number; y: number };
  control: { x: number; y: number };
  end: { x: number; y: number };
  fontSize: number;
  letterSpacing?: number;
};

export type Faction = {
  id: string;
  name: string;
  englishName: string;
  color: string;
  mapLabelCount: number;
  primaryMapLabelPath?: FactionMapLabelPath;
  mapLabelPaths?: readonly FactionMapLabelPath[];
};

export type MapMode = "political" | "faction" | "army" | "navy" | "air";
