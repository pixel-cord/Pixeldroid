import { PluginInstanceInternal } from "@lib/addons/plugins/types";

interface CorePlugin {
    default: PluginInstanceInternal;
    preenabled: boolean;
}

// Called from @lib/plugins
export const getCorePlugins = (): Record<string, CorePlugin> => ({
    "bunny.quickinstall": require("./quickinstall"),
    "pixelcord.badges": require("./badges"),
    "pixelcord.notrack": require("./notrack"),
    "pixelcord.silenttyping": require("./silenttyping"),
    "pixelcord.noreplymention": require("./noreplymention"),
    "pixelcord.fakemute": require("./fakemute"),
    "pixelcord.messagecleaner": require("./messagecleaner"),
    "pixelcord.clearurls": require("./clearurls"),
    "pixelcord.hidebadges": require("./hidebadges"),
    "pixelcord.moreconnections": require("./moreconnections")
});

/**
 * @internal
 */
export function defineCorePlugin(instance: PluginInstanceInternal): PluginInstanceInternal {
    // @ts-expect-error
    instance[Symbol.for("bunny.core.plugin")] = true;
    return instance;
}
