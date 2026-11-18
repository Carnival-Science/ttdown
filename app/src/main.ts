// Fonts are self-hosted (no third-party font CDN): Archivo (variable, with width), IBM Plex Sans, JetBrains Mono. OFL-1.1.
import "@fontsource-variable/archivo/wdth.css";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/600.css";
import "@ui-sdk/core/web.css";
import "./lib/design/tokens.css";
import "./lib/design/components.css";
import "./lib/design/app.css";
import { mount } from "svelte";
import App from "./App.svelte";
import { installBuildIdentity } from "./lib/build/identity";

installBuildIdentity();
const target = document.getElementById("app");
if (!target) throw new Error("#app is missing from index.html");
export default mount(App, { target });
