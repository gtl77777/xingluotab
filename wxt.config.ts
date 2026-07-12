import { defineConfig } from "wxt";
import packageJson from "./package.json";

export default defineConfig({
  manifestVersion: 3,
  modules: ["@wxt-dev/module-react"],
  vite: () => ({
    server: {
      hmr: false
    }
  }),
  hooks: {
    "build:manifestGenerated": (_, manifest) => {
      manifest.options_ui = {
        ...(manifest.options_ui ?? {}),
        page: "options.html",
        open_in_tab: true
      };
    }
  },
  manifest: {
    name: "__MSG_extName__",
    description: "__MSG_extDescription__",
    default_locale: "en",
    version: packageJson.version,
    permissions: ["storage", "tabs", "tabGroups", "unlimitedStorage", "favicon"],
    host_permissions: ["*://*/*"],
    action: {
      default_icon: {
        "16": "icon/16.png",
        "32": "icon/32.png",
        "48": "icon/48.png",
        "96": "icon/96.png",
        "128": "icon/128.png"
      }
    },
    icons: {
      "16": "icon/16.png",
      "32": "icon/32.png",
      "48": "icon/48.png",
      "64": "icon/64.png",
      "96": "icon/96.png",
      "128": "icon/128.png"
    },
    commands: {
      dashboard: {
        description: "Open XingLuoTab Dashboard in a new tab",
        suggested_key: {
          default: "Ctrl+Shift+O",
          mac: "Command+Shift+O"
        }
      },
      dashboard_single: {
        description: "Open XingLuoTab Dashboard",
        suggested_key: {
          default: "Ctrl+Shift+P",
          mac: "Command+Shift+P"
        }
      }
    },
    options_ui: {
      page: "options.html",
      open_in_tab: true
    }
  }
});
