// The published reference values that test/accuracy.test.ts measures the package against. Every number here was copied by hand from the source named beside it, on the date named,
// and nothing here is computed from this package. If a value could not be read from its source it is not here.

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// 1. The Sun, from NASA/JPL Horizons (https://ssd.jpl.nasa.gov/api/horizons.api), read on 2026-11-17 with the two requests below (times in UT, Julian days as written; one request each).
//
//    Right ascension and declination: COMMAND='10' (the Sun), CENTER='500@399' (the Earth's centre), EPHEM_TYPE='OBSERVER', TLIST_TYPE='JD', TIME_TYPE='UT',
//    QUANTITIES='2', ANG_FORMAT='DEG', EXTRA_PREC='YES'. The column is "R.A. (a-app), DEC (a-app)": the airless apparent place of the Sun's centre, in the Earth's equator and equinox
//    of date (light time, aberration and nutation in), seen from the Earth's centre.
//
//    Apparent sidereal time at longitude 0: the same Sun, CENTER='coord@399', COORD_TYPE='GEODETIC', SITE_COORD='0,0,0', QUANTITIES='7'. The column is "L_Ap_Sid_Time", decimal hours,
//    measured west from the meridian to the true equinox: at longitude 0 it is Greenwich apparent sidereal time.
//
//    The Sun is overhead at latitude = declination and longitude (east) = right ascension - sidereal time * 15 degrees. That arithmetic is done in the test, not here.
//    (Horizons' own "sub-observer point" of the Earth seen from the Sun, QUANTITIES='14', was not used: it takes the Earth's turn at the light-time-earlier moment, 2 degrees of longitude away.)
// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
export interface SunReference {
  /** The moment, UTC. */
  readonly utc: string;
  /** Right ascension of the Sun, apparent, of date, degrees. */
  readonly raDeg: number;
  /** Declination of the Sun, apparent, of date, degrees. */
  readonly decDeg: number;
  /** Greenwich apparent sidereal time, hours. */
  readonly siderealHours: number;
}
export const SUN_SOURCE = "NASA/JPL Horizons API, https://ssd.jpl.nasa.gov/api/horizons.api, read 2026-11-17";
export const SUN: readonly SunReference[] = [
  { utc: "1950-05-05T03:00:00Z", raDeg: 41.594287351, decDeg: 16.062968316, siderealHours: 17.8278983404 }, // JD 2433406.625
  { utc: "1980-02-29T06:00:00Z", raDeg: 341.356144457, decDeg: -7.891132734, siderealHours: 16.5475654264 }, // JD 2444298.75
  { utc: "2000-01-01T12:00:00Z", raDeg: 281.278375239, decDeg: -23.03243013, siderealHours: 18.6972361132 }, // JD 2451545.0
  { utc: "2026-03-20T14:46:00Z", raDeg: 359.999976875, decDeg: 0.00009446, siderealHours: 2.6433061498 }, // JD 2461120.115277778
  { utc: "2026-06-21T08:24:00Z", raDeg: 89.999620604, decDeg: 23.437933384, siderealHours: 2.3702360946 }, // JD 2461212.85
  { utc: "2026-09-23T00:05:00Z", raDeg: 179.999847918, decDeg: 0.000056603, siderealHours: 0.2075353093 }, // JD 2461306.503472222
  { utc: "2026-12-21T20:50:00Z", raDeg: 269.999803753, decDeg: -23.437415475, siderealHours: 2.8625063715 }, // JD 2461396.3680555555
  { utc: "2075-01-15T21:30:00Z", raDeg: 297.834613492, decDeg: -20.966277034, siderealHours: 5.1979687715 }, // JD 2478953.3958333335
];

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// 2. SGP4, from the verification set that goes with Vallado, Crawford, Hujsak and Kelso, "Revisiting Spacetrack Report #3", AIAA 2006-6753 (2006).
//    The element sets are lines of CelesTrak's copy of Vallado's SGP4-VER.TLE:
//      https://raw.githubusercontent.com/CelesTrak/fundamentals-of-astrodynamics/main/datalib/SGP4-VER.TLE
//    The expected positions are the TEME rows (km, kilometres a second) of Vallado's own SGP4 program's STK ephemeris files, in CelesTrak's repository:
//      https://github.com/CelesTrak/fundamentals-of-astrodynamics/tree/main/software/cpp/TestSGP4/TestSGP4/<number>.e
//    Both read on 2026-11-17. A row's time is seconds since the element set's epoch; here it is minutes (seconds / 60). Only the rows listed were copied.
//    NOT checked: the paper's own printed tables and tcppver.out. CelesTrak's page for the paper (https://celestrak.org/publications/AIAA/2006-6753/) links only a zip of the source, which
//    may not be downloaded here, so those two were not read; the .e files are the same program's output for the same element sets.
// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
export interface Row {
  /** Minutes since the element set's epoch. */
  readonly minutes: number;
  /** TEME position, km. */
  readonly r: readonly [number, number, number];
}
export interface Sgp4Case {
  readonly name: string;
  readonly line1: string;
  readonly line2: string;
  readonly rows: readonly Row[];
}
export const SGP4_SOURCE = "Vallado et al., AIAA 2006-6753 verification set (CelesTrak fundamentals-of-astrodynamics: datalib/SGP4-VER.TLE and TestSGP4/<number>.e), read 2026-11-17";
export const SGP4: readonly Sgp4Case[] = [
  {
    // near Earth, e = 0.186 (SGP4-VER.TLE entry 00005; 00005.e: ScenarioEpoch 27 Jun 2000 18:50:19.733567999, step 21600 s)
    name: "00005 (near Earth, e 0.19)",
    line1: "1 00005U 58002B   00179.78495062  .00000023  00000-0  28098-4 0  4753",
    line2: "2 00005  34.2682 348.7242 1859667 331.7664  19.3264 10.82419157413667",
    rows: [
      { minutes: 0, r: [7022.46529266, -1400.08296755, 0.03995155] },
      { minutes: 360, r: [-7154.03120202, -3783.17682504, -3536.19412294] },
      { minutes: 720, r: [-7134.59340119, 6531.68641334, 3260.27186483] },
      { minutes: 1080, r: [5568.53901181, 4492.06992591, 3863.87641983] },
      { minutes: 1440, r: [-938.55923943, -6268.18748831, -4294.02924751] },
      { minutes: 1800, r: [-9680.56121728, 2802.47771354, 124.10688038] },
      { minutes: 2160, r: [190.19796988, 7746.96653614, 5110.00675412] },
      { minutes: 2520, r: [5579.55640116, -3995.61396789, -1518.82108966] },
      { minutes: 2880, r: [-8650.73082219, -1914.93811525, -3007.03603443] },
      { minutes: 3240, r: [-5429.79204164, 7574.36493792, 3747.39305236] },
      { minutes: 3600, r: [6759.04583722, 2001.5819822, 2783.55192533] },
      { minutes: 3960, r: [-3791.44531559, -5712.95617894, -4533.48630714] },
      { minutes: 4320, r: [-9060.47373569, 4658.70952502, 813.68673153] },
    ],
  },
  {
    // near Earth, low, the Spacetrack Report #3 SGP4 test (SGP4-VER.TLE entry 88888; 88888.e: ScenarioEpoch 1 Oct 1980 23:41:24.113759999, step 7200 s)
    name: "88888 (Spacetrack Report #3 test)",
    line1: "1 88888U          80275.98708465  .00073094  13844-3  66816-4 0    87",
    line2: "2 88888  72.8435 115.9689 0086731  52.6988 110.5714 16.05824518  1058",
    rows: [
      { minutes: 0, r: [2328.96975262, -5995.22051338, 1719.97297192] },
      { minutes: 120, r: [1020.69234558, 2286.56260634, -6191.55565927] },
      { minutes: 240, r: [-3226.54349155, 3503.70977525, 4532.80979343] },
      { minutes: 360, r: [2456.10706533, -6071.93855503, 1222.89768554] },
      { minutes: 480, r: [787.16457349, 2719.91800946, -6043.86662024] },
      { minutes: 600, r: [-3110.97648029, 3121.73026235, 4878.15217035] },
      { minutes: 720, r: [2567.56229695, -6112.50383922, 713.96374435] },
      { minutes: 840, r: [556.0566178, 3144.52288201, -5855.34636178] },
    ],
  },
  {
    // near Earth with strong drag (SGP4-VER.TLE entry 06251, DELTA 1 DEB; 06251.e: ScenarioEpoch 25 Jun 2006 19:46:43.980095999, step 7200 s)
    name: "06251 (strong drag)",
    line1: "1 06251U 62025E   06176.82412014  .00008885  00000-0  12808-3 0  3985",
    line2: "2 06251  58.0579  54.0425 0030035 139.1568 221.1854 15.56387291  6774",
    rows: [
      { minutes: 0, r: [3988.31022699, 5498.96657235, 0.90055879] },
      { minutes: 120, r: [-3935.69800083, 409.10980837, 5471.33577327] },
      { minutes: 240, r: [-1675.12766915, -5683.30432352, -3286.21510937] },
      { minutes: 360, r: [4993.62642836, 2890.549699, -3600.40145627] },
      { minutes: 480, r: [-1115.07959514, 4015.11691491, 5326.99727718] },
      { minutes: 600, r: [-4329.10008198, -5176.70287935, 409.65313857] },
      { minutes: 720, r: [3692.60030028, -976.24265255, -5623.36447493] },
      { minutes: 840, r: [2301.83510037, 5723.92394553, 2814.6151458] },
    ],
  },
  {
    // deep space, a Molniya-type orbit, e = 0.73, a 12 hour period (SGP4-VER.TLE entry 11801, "Original STR#3 SDP4 test"; 11801.e: ScenarioEpoch 17 Aug 1980 7:06:40.136832000, step 21600 s)
    name: "11801 (deep space, e 0.73)",
    line1: "1 11801U          80230.29629788  .01431103  00000-0  14311-1      13",
    line2: "2 11801  46.7916 230.4354 7318036  47.4722  10.4117  2.28537848    13",
    rows: [
      { minutes: 0, r: [7473.37102491, 428.94748312, 5828.74846783] },
      { minutes: 360, r: [-3305.22148694, 32410.84323331, -24697.16974954] },
      { minutes: 720, r: [14271.29083858, 24110.44309009, -4725.76320143] },
      { minutes: 1080, r: [-9990.05800009, 22717.34212448, -23616.88515553] },
      { minutes: 1440, r: [9787.87836256, 33753.32249667, -15030.79874625] },
    ],
  },
];
