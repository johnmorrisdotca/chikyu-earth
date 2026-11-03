// What the demo and the embed frame share about the satellite groups: how each looks, and how a group's file (elements/<id>.json, made by scripts/elements.ts) becomes element sets.
export const GROUP_STYLE: Record<string, { color: string; size: number; orbits: boolean }> = {
  stations: { color: "#ffd54f", size: 6, orbits: true },
  famous: { color: "#ff8a65", size: 6, orbits: true },
  science: { color: "#b39ddb", size: 5, orbits: false },
  "earth-observation": { color: "#69f0ae", size: 3.5, orbits: false },
  weather: { color: "#4dd0e1", size: 4, orbits: false },
  geostationary: { color: "#f48fb1", size: 3.5, orbits: false },
  gps: { color: "#ffb74d", size: 4.5, orbits: false },
  glonass: { color: "#ef5350", size: 4.5, orbits: false },
  galileo: { color: "#64b5f6", size: 4.5, orbits: false },
  beidou: { color: "#fff176", size: 4.5, orbits: false },
  amateur: { color: "#aed581", size: 4, orbits: false },
  oneweb: { color: "#ce93d8", size: 2.5, orbits: false },
  iridium: { color: "#80cbc4", size: 3.5, orbits: false },
  starlink: { color: "#7fd4ff", size: 2.5, orbits: false },
  yours: { color: "#ffffff", size: 4, orbits: false },
};

export interface GroupFile {
  id: string;
  retrieved: string;
  all: number;
  fields: string[];
  rows: (string | number)[][];
}

/** A group's file from this site, or a rejection with the answer's status. */
export const fetchGroup = (id: string): Promise<GroupFile> => fetch(`elements/${id}.json`).then((response) => (response.ok ? (response.json() as Promise<GroupFile>) : Promise.reject(new Error(String(response.status)))));

/** The element sets of a group's file, as `createSatellites` takes them. */
export const setsOfGroup = (file: GroupFile): never[] => file.rows.map((row) => Object.fromEntries(file.fields.map((field, index) => [field, row[index]])) as never);
