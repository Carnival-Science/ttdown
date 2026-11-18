import "@ui-sdk/core/web.css";
import "./lib/design/tokens.css";
import "./lib/design/base.css";
import { mount } from "svelte";
import App from "./App.svelte";
import { installBuildIdentity } from "./lib/build/identity";

installBuildIdentity();
const target = document.getElementById("app");
if (!target) throw new Error("#app is missing from index.html");
export default mount(App, { target });
