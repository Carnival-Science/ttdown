// Fonts are self-hosted (no third-party font CDN), Latin subset only: Archivo (variable), IBM Plex Sans, JetBrains Mono. OFL-1.1.
import "./lib/design/fonts.css";
import "@fontsource/ibm-plex-sans/latin-400.css";
import "@fontsource/ibm-plex-sans/latin-500.css";
import "@fontsource/ibm-plex-sans/latin-600.css";
import "@fontsource/jetbrains-mono/latin-500.css";
import "@fontsource/jetbrains-mono/latin-600.css";
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
