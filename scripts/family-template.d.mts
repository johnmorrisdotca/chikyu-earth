// Types for scripts/family-template.mjs, which is copied byte for byte into every repository of the family and so stays plain JavaScript.
// Only the names a package's scripts import are declared. Written by hand beside it; when the template gains an export that a script uses, add it here.
export const FAMILY_TEMPLATE_VERSION: string;
export const FAMILY: readonly { id: string; name: string; kana: string }[];
export const FAMILY_NOT_ON_NPM: readonly string[];
export const FAMILY_PITCH: Readonly<Record<string, string>>;
export const FAMILY_CLOTHS: Readonly<Record<string, { felt: string; deep: string; ink: string }>>;
export const FAMILY_WORDS: Readonly<Record<"en" | "ja", Readonly<Record<string, string>>>>;
export const FAMILY_SCRIPT: string;
export function familyHead(options: { id: string; title: string; description: string; ogTitle?: string; ogDescription?: string }): string;
export function familyHeader(options: { id: string; links?: readonly { href: string; say: string }[] }): string;
export function familyUnreviewed(options: { id: string }): string;
export function familyFooter(options: { id: string }): string;
