import { createApp } from "vue";
import EarthGlobe from "./EarthGlobe.vue";

const app = createApp(EarthGlobe);
app.config.compilerOptions.isCustomElement = (tag) => tag === "chikyu-earth";
app.mount("#app");
