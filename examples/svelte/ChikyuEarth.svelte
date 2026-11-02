<script lang="ts">
  import { onMount } from "svelte";

  let { center = "139.7,35.7", look = "thick" }: { center?: string; look?: "line" | "thick" } = $props();

  // The element needs a browser: onMount never runs on the server.
  onMount(() => {
    void import("@johnmorrisdotca/chikyu-earth/element");
  });
</script>

<chikyu-earth {center} {look} graticule></chikyu-earth>
