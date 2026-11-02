---
title: In React, Vue, Svelte and Angular
section: how-to
order: 4
description: Use the globe in React, Vue, Svelte and Angular, with the import that keeps a server render working.
---

`<chikyu-earth>` is a web component, so every framework can use it. Three things apply everywhere:

1. **Import the element on the client only.** The element extends the browser's `HTMLElement`, so importing it on a server fails. Each example below imports it inside the framework's "the page is in a browser" hook (`useEffect`, `onMounted`, `onMount`, `ngOnInit`), which a server render never runs. A top-level `import "@johnmorrisdotca/chikyu-earth/element"` is fine in a client-only app.
2. **Use `look`, not `style`.** `look="thick"` picks the outlines. The older `style` attribute is read by frameworks as CSS and breaks: React rejects a string for `style`.
3. **Do not name your component `ChikyuEarth` in Vue.** A single-file component refers to itself by its file name, so `<chikyu-earth>` inside a file called `ChikyuEarth.vue` loads the component instead of the element, and it recurses forever. The example is called `EarthGlobe.vue`.

## React

```tsx
import { useEffect, useRef } from "react";

export function ChikyuEarth({ center = "139.7,35.7", look = "thick" }: { center?: string; look?: "line" | "thick" }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // The element needs a browser, so it is imported here, never at the top of the file: a server render never reaches an effect.
    void import("@johnmorrisdotca/chikyu-earth/element");
  }, []);
  return (
    <div ref={host}>
      <chikyu-earth center={center} look={look} graticule />
    </div>
  );
}
```

With TypeScript, tell React the tag exists (a file such as `chikyu-earth.d.ts`):

```ts no-run
import type { DetailedHTMLProps, HTMLAttributes } from "react";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "chikyu-earth": DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & { center?: string; size?: number | string; look?: string; graticule?: boolean };
    }
  }
}
```

The component renders to a string on a server (`renderToString`), as the package's tests check: the tag is there, the globe is drawn in the browser.

## Vue

```vue
<script setup lang="ts">
import { onMounted } from "vue";

withDefaults(defineProps<{ center?: string; look?: "line" | "thick" }>(), { center: "139.7,35.7", look: "thick" });

// The element needs a browser: import it once the component is on the page, never while a server renders it.
onMounted(() => {
  void import("@johnmorrisdotca/chikyu-earth/element");
});
</script>

<template>
  <chikyu-earth :center="center" :look="look" graticule></chikyu-earth>
</template>
```

Tell Vue's compiler that the tag is a custom element, in `main.ts`:

```ts no-check
import { createApp } from "vue";
import EarthGlobe from "./EarthGlobe.vue";

const app = createApp(EarthGlobe);
app.config.compilerOptions.isCustomElement = (tag) => tag === "chikyu-earth";
app.mount("#app");
```

With Vite, the same option goes in `vue({ template: { compilerOptions: { isCustomElement: (tag) => tag === "chikyu-earth" } } })`.

## Svelte

```svelte
<script lang="ts">
  import { onMount } from "svelte";

  let { center = "139.7,35.7", look = "thick" }: { center?: string; look?: "line" | "thick" } = $props();

  // The element needs a browser: onMount never runs on the server.
  onMount(() => {
    void import("@johnmorrisdotca/chikyu-earth/element");
  });
</script>

<chikyu-earth {center} {look} graticule></chikyu-earth>
```

## Angular

Standalone, with `CUSTOM_ELEMENTS_SCHEMA` so the template may hold an unknown tag. Bind the attribute with `[attr.look]`, since the element reads attributes:

```ts no-run
import { Component, CUSTOM_ELEMENTS_SCHEMA, Input, OnInit } from "@angular/core";

@Component({
  selector: "app-chikyu-earth",
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `<chikyu-earth [attr.center]="center" [attr.look]="look" graticule></chikyu-earth>`,
})
export class ChikyuEarthComponent implements OnInit {
  @Input() center = "139.7,35.7";
  @Input() look: "line" | "thick" = "thick";

  ngOnInit(): void {
    // The element needs a browser: ngOnInit also runs when a server renders, so the import waits for one.
    if (typeof window !== "undefined") void import("@johnmorrisdotca/chikyu-earth/element");
  }
}
```

## Next.js, Nuxt, SvelteKit

They render on a server first, so everything above holds: the element is imported inside a client-only hook, never at the top of a file a server loads. In Next.js's App Router the component file starts with `"use client"`. To draw the globe on the server too, call `globe()` and put its string in the page: see [TypeScript and Node](typescript-and-node.md).

## Turning, zooming and markers

The shared view controls and the markers are plain DOM: get the element with a ref (`useRef`, `ref`, `bind:this`, `@ViewChild`) and call `setView(...)` or `attachMarkers(element)` from the same hook, after the import has resolved. Remember to call a marker set's `detach()` when the component goes away.
