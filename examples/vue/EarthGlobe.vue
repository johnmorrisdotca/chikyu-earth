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
