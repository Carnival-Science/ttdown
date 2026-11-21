// Fonts are self-hosted (no third-party font CDN), all OFL-1.1: Absans and Necto Mono (lib/design/fonts), Archivo for the wordmark only.
import "./lib/design/fonts.css";
// ui-sdk default styles, once, at the entry and before our own stylesheets, so TTdown's tokens and components still win.
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
