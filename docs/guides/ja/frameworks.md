---
title: React、Vue、Svelte、Angular で使う
section: how-to
order: 4
description: React、Vue、Svelte、Angular で地球儀を使います。サーバーでの描画を壊さない import の仕方も示します。
---

`<chikyu-earth>` は Web コンポーネントなので、どのフレームワークでも使えます。どれにも共通する注意が3つあります。

1. **要素は、ブラウザーでだけ import します。** 要素はブラウザーの `HTMLElement` を継承しているため、サーバーで import すると失敗します。下の例は、どれも「ページがブラウザーにある」ときのフック (`useEffect`、`onMounted`、`onMount`、`ngOnInit`) の中で import しています。サーバーの描画では、このフックは動きません。ブラウザーだけで動くアプリなら、ファイルの先頭の `import "@johnmorrisdotca/chikyu-earth/element"` でも構いません。
2. **`style` ではなく `look` を使います。** `look="thick"` で輪郭の太さを選びます。古い `style` 属性は、フレームワークから CSS として読まれて壊れます。React は `style` に文字列を渡すとエラーにします。
3. **Vue では、コンポーネントに `ChikyuEarth` という名前を付けません。** 単一ファイルコンポーネントは、ファイル名で自分自身を指せます。`ChikyuEarth.vue` の中の `<chikyu-earth>` は、要素ではなくコンポーネント自身になり、無限に繰り返します。例のファイル名は `EarthGlobe.vue` です。

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

TypeScript では、タグがあることを React に教えます (`chikyu-earth.d.ts` などのファイルに書きます)。

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

このコンポーネントは、サーバーで文字列に描画できます (`renderToString`)。パッケージのテストで確かめています。タグは出力に入り、地球儀はブラウザーで描かれます。

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

`main.ts` で、このタグがカスタム要素であることを Vue のコンパイラーに教えます。

```ts no-check
import { createApp } from "vue";
import EarthGlobe from "./EarthGlobe.vue";

const app = createApp(EarthGlobe);
app.config.compilerOptions.isCustomElement = (tag) => tag === "chikyu-earth";
app.mount("#app");
```

Vite を使うなら、同じ設定を `vue({ template: { compilerOptions: { isCustomElement: (tag) => tag === "chikyu-earth" } } })` に書きます。

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

スタンドアロンのコンポーネントで、`CUSTOM_ELEMENTS_SCHEMA` を使い、テンプレートに未知のタグを書けるようにします。要素は属性を読むので、`[attr.look]` で渡します。

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

## Next.js、Nuxt、SvelteKit

これらは最初にサーバーで描画するので、上と同じです。要素は、ブラウザー専用のフックの中で import します。サーバーが読むファイルの先頭では import しません。Next.js の App Router では、コンポーネントのファイルの先頭に `"use client"` を書きます。サーバーでも地球儀を描きたいときは、`globe()` を呼んで、その文字列をページに入れます ([TypeScript と Node](typescript-and-node.md))。

## 回す、拡大する、目印を付ける

共有のビューコントロールと目印は、普通の DOM です。ref (`useRef`、`ref`、`bind:this`、`@ViewChild`) で要素を取り、import が終わってから、同じフックの中で `setView(...)` や `attachMarkers(element)` を呼びます。コンポーネントがなくなるときは、目印のセットの `detach()` を呼んでください。
