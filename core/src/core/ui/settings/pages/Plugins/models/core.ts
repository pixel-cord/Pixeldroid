import { PyoncordIcon } from "@core/ui/settings";
import { disablePlugin, enablePlugin, getPluginSettingsComponent, isPluginEnabled, pluginSettings } from "@lib/addons/plugins";
import { useObservable } from "@lib/api/storage";

import { UnifiedPluginModel } from ".";

// Core plugins use a FLAT manifest ({ id, name, description, authors }) unlike
// Bunny/URL plugins which nest those under `manifest.display`. unifyBunnyPlugin
// would crash on them, so the Pixelcord core plugins get their own mapper here
// to show up in the Plugins page with working toggles.
export default function unifyCorePlugin(manifest: any): UnifiedPluginModel {
    return {
        id: manifest.id,
        name: manifest.name,
        description: manifest.description,
        authors: manifest.authors,

        getBadges() {
            return [{ source: { uri: PyoncordIcon } }];
        },
        isEnabled: () => isPluginEnabled(manifest.id),
        isInstalled: () => manifest.id in pluginSettings,
        usePluginState() {
            useObservable([pluginSettings]);
        },
        toggle(start: boolean) {
            try {
                start
                    ? enablePlugin(manifest.id, true)
                    : disablePlugin(manifest.id);
            } catch (e) {
                console.error(e);
            }
        },
        resolveSheetComponent() {
            return import("../sheets/PluginInfoActionSheet");
        },
        getPluginSettingsComponent() {
            return getPluginSettingsComponent(manifest.id);
        },
    };
}
