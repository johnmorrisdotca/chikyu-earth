// The owner codes of the satellite catalogue and the country each stands for, as an ISO 3166-1 alpha-2 code, for a page that shows a flag or a country beside a satellite.
// Typed from the catalogue's published list of owner sources, read 2026-11-12 (credited in NOTICE.md): a code, and what it stands for. Pure data: no flag, no name.

/**
 * Every owner code of the satellite catalogue with its country as an ISO 3166-1 alpha-2 code, or `null` where the owner is not one country: an organisation (`ESA`, `ISS`, `ITSO`, `SES`, `GLOB`, ...),
 * several countries (`FGER`, France and Germany; `PRES`, China and ESA), not known (`UNK`, `TBD`), or not one country (`CIS`, the former Soviet registration). `ISRO`, India's space agency, is `IN`.
 *
 * @example
 * ```ts
 * import { OWNER_COUNTRIES } from "@johnmorrisdotca/chikyu-earth/satellites";
 *
 * console.log(OWNER_COUNTRIES["PRC"], OWNER_COUNTRIES["ESA"], Object.keys(OWNER_COUNTRIES).length);
 * ```
 */
export const OWNER_COUNTRIES: Readonly<Record<string, string | null>> = {
  AB: null, // Arab Satellite Communications Organization
  ABS: null, // Asia Broadcast Satellite
  AC: null, // Asia Satellite Telecommunications Company (ASIASAT)
  ALG: "DZ", // Algeria
  ANG: "AO", // Angola
  ARGN: "AR", // Argentina
  ARM: "AM", // Republic of Armenia
  ASRA: "AT", // Austria
  AUS: "AU", // Australia
  AZER: "AZ", // Azerbaijan
  BEL: "BE", // Belgium
  BELA: "BY", // Belarus
  BERM: "BM", // Bermuda
  BGD: "BD", // Peoples Republic of Bangladesh
  BHR: "BH", // The Kingdom of Bahrain
  BHUT: "BT", // The Kingdom of Bhutan
  BOL: "BO", // Bolivia
  BRAZ: "BR", // Brazil
  BUL: "BG", // Bulgaria
  BWA: "BW", // Republic of Botswana
  CA: "CA", // Canada
  CHBZ: null, // China/Brazil
  CHTU: null, // China/Türkiye
  CHLE: "CL", // Chile
  CIS: null, // Commonwealth of Independent States (former USSR): the list names no one country, so none
  COL: "CO", // Colombia
  CRI: "CR", // Republic of Costa Rica
  CZCH: "CZ", // Czech Republic (former Czechoslovakia)
  DEN: "DK", // Denmark
  DJI: "DJ", // Republic of Djibouti
  ECU: "EC", // Ecuador
  EGYP: "EG", // Egypt
  ESA: null, // European Space Agency
  ESRO: null, // European Space Research Organization
  EST: "EE", // Estonia
  ETH: "ET", // Ethiopia
  EUME: null, // European Organization for the Exploitation of Meteorological Satellites (EUMETSAT)
  EUTE: null, // European Telecommunications Satellite Organization (EUTELSAT)
  FGER: null, // France/Germany
  FIN: "FI", // Finland
  FR: "FR", // France
  FRIT: null, // France/Italy
  GER: "DE", // Germany
  GHA: "GH", // Republic of Ghana
  GLOB: null, // Globalstar
  GREC: "GR", // Greece
  GRSA: null, // Greece/Saudi Arabia
  GUAT: "GT", // Guatemala
  HRV: "HR", // Republic of Croatia
  HUN: "HU", // Hungary
  IM: null, // International Mobile Satellite Organization (INMARSAT)
  IND: "IN", // India
  INDO: "ID", // Indonesia
  IRAN: "IR", // Iran
  IRAQ: "IQ", // Iraq
  IRID: null, // Iridium
  IRL: "IE", // Ireland
  ISRA: "IL", // Israel
  ISRO: "IN", // Indian Space Research Organisation: one country's agency
  ISS: null, // International Space Station
  IT: "IT", // Italy
  ITSO: null, // International Telecommunications Satellite Organization (INTELSAT)
  JPN: "JP", // Japan
  KAZ: "KZ", // Kazakhstan
  KEN: "KE", // Republic of Kenya
  LAOS: "LA", // Laos
  LKA: "LK", // Democratic Socialist Republic of Sri Lanka
  LTU: "LT", // Lithuania
  LUXE: "LU", // Luxembourg
  MA: "MA", // Morroco
  MALA: "MY", // Malaysia
  MCO: "MC", // Principality of Monaco
  MDA: "MD", // Republic of Moldova
  MEX: "MX", // Mexico
  MMR: "MM", // Republic of the Union of Myanmar
  MNE: "ME", // Montenegro
  MNG: "MN", // Mongolia
  MUS: "MU", // Mauritius
  NATO: null, // North Atlantic Treaty Organization
  NETH: "NL", // Netherlands
  NICO: null, // New ICO
  NIG: "NG", // Nigeria
  NKOR: "KP", // Democratic People's Republic of Korea
  NOR: "NO", // Norway
  NPL: "NP", // Federal Democratic Republic of Nepal
  NZ: "NZ", // New Zealand
  O3B: null, // O3b Networks
  ORB: null, // ORBCOMM
  PAKI: "PK", // Pakistan
  PERU: "PE", // Peru
  POL: "PL", // Poland
  POR: "PT", // Portugal
  PRC: "CN", // People's Republic of China
  PRY: "PY", // Republic of Paraguay
  PRES: null, // People's Republic of China/European Space Agency
  QAT: "QA", // State of Qatar
  RASC: null, // RascomStar-QAF
  ROC: "TW", // Taiwan (Republic of China)
  ROM: "RO", // Romania
  RP: "PH", // Philippines (Republic of the Philippines)
  RWA: "RW", // Republic of Rwanda
  SAFR: "ZA", // South Africa
  SAUD: "SA", // Saudi Arabia
  SDN: "SD", // Republic of Sudan
  SEAL: null, // Sea Launch
  SEN: "SN", // Republic of Senegal
  SES: null, // SES
  SGJP: null, // Singapore/Japan
  SING: "SG", // Singapore
  SKOR: "KR", // Republic of Korea
  SLB: "SB", // Solomon Islands
  SPN: "ES", // Spain
  STCT: null, // Singapore/Taiwan
  SVN: "SI", // Slovenia
  SWED: "SE", // Sweden
  SWTZ: "CH", // Switzerland
  TBD: null, // To Be Determined
  THAI: "TH", // Thailand
  TMMC: null, // Turkmenistan/Monaco
  TUN: "TN", // Republic of Tunisia
  TURK: "TR", // Türkiye
  UAE: "AE", // United Arab Emirates
  UK: "GB", // United Kingdom
  UKR: "UA", // Ukraine
  UNK: null, // Unknown
  URY: "UY", // Uruguay
  US: "US", // United States
  USBZ: null, // United States/Brazil
  VAT: "VA", // Vatican City State
  VENZ: "VE", // Venezuela
  VTNM: "VN", // Vietnam
  ZWE: "ZW", // Republic of Zimbabwe
};

/**
 * The country of a satellite's owner code as an ISO 3166-1 alpha-2 code (`PRC` is `CN`, `PAKI` is `PK`, `US` is `US`), or `undefined` for an organisation, several countries, an ambiguous owner or a code that is not in the list.
 *
 * @param code - The owner code as the catalogue writes it (`COUNTRY_CODE` or `OWNER`): case and spaces round it do not matter.
 * @returns The two-letter country code, or `undefined`.
 *
 * @example
 * ```ts
 * import { ownerCountry } from "@johnmorrisdotca/chikyu-earth/satellites";
 *
 * console.log(ownerCountry("PRC"), ownerCountry("PAKI"), ownerCountry("ESA"), ownerCountry("XYZ"));
 * ```
 */
export function ownerCountry(code: string | null | undefined): string | undefined {
  const key = (code ?? "").trim().toUpperCase();
  return (Object.hasOwn(OWNER_COUNTRIES, key) ? OWNER_COUNTRIES[key] : undefined) ?? undefined;
}
