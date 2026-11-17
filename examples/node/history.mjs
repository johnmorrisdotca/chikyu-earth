import { altitudeSeries, createSatelliteHistory } from "@johnmorrisdotca/chikyu-earth/satellites";

// One satellite's history on a server: two element sets a week apart (your page brings them; chikyu fetches nothing), its launch and decay, and where it stands on four dates.
const set = (epoch, meanMotion, meanAnomaly) => ({
  OBJECT_NAME: "ISS (ZARYA)",
  OBJECT_ID: "1998-067A",
  EPOCH: epoch,
  MEAN_MOTION: meanMotion,
  ECCENTRICITY: 0.0007139,
  INCLINATION: 51.6332,
  RA_OF_ASC_NODE: 335.9757,
  ARG_OF_PERICENTER: 339.3739,
  MEAN_ANOMALY: meanAnomaly,
  NORAD_CAT_ID: 25544,
  BSTAR: 0.00012,
  MEAN_MOTION_DOT: 0.0001,
  MEAN_MOTION_DDOT: 0,
});
const sets = [set("2026-11-02T10:25:21.580320", 15.49150046, 20.6961), set("2026-11-09T10:25:21.580320", 15.50, 200)];
const history = createSatelliteHistory(sets, { launch: "1998-11-20", decay: "2031-01-01" });
for (const day of ["1998-01-01", "2026-11-05", "2026-11-20", "2031-06-01"]) {
  const now = history.describe(Date.parse(`${day}T12:00:00Z`));
  console.log(`${day}: ${now.status}${now.uncertaintyKm > 0 ? `, within ${Math.round(now.uncertaintyKm)} km` : ""}`);
}
console.log(altitudeSeries(sets).map((point) => `${new Date(point.epochMs).toISOString().slice(0, 10)} ${Math.round(point.altitudeKm)} km`).join(", "));
