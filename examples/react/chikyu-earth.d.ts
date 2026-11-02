import type { DetailedHTMLProps, HTMLAttributes } from "react";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "chikyu-earth": DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & { center?: string; size?: number | string; look?: string; graticule?: boolean };
    }
  }
}
