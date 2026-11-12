// The sky cultures besides the IAU's, each loaded by a dynamic import of its own, only when a page asks for it: a page that never sets `chinese` never downloads it. (The imports are written out, one for each, so that a bundler makes a file of each.)
// Importing this file is what puts them in a build: the default entries do, the entries without cultures do not.
import { setCultureLoaders } from "./culture-source.ts";

setCultureLoaders({
  western: async () => (await import("@johnmorrisdotca/hoshi-stars/cultures/western")).western,
  japanese: async () => (await import("@johnmorrisdotca/hoshi-stars/cultures/japanese")).japanese,
  chinese: async () => (await import("@johnmorrisdotca/hoshi-stars/cultures/chinese")).chinese,
});
