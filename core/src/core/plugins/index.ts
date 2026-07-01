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
    "pixelcord.messagelogger": require("./messagelogger"),
    "pixelcord.clearurls": require("./clearurls"),
    "pixelcord.hidebadges": require("./hidebadges"),
    "pixelcord.moreconnections": require("./moreconnections"),
    "pixelcord.anonymisefiles": require("./anonymisefiles"),
    "pixelcord.noprofilethemes": require("./noprofilethemes"),
    "pixelcord.fakeprofilethemes": require("./fakeprofilethemes"),
    "pixelcord.platformindicators": require("./platformindicators"),
    "pixelcord.dontroundtimestamps": require("./dontroundtimestamps"),
    "pixelcord.showmeyourname": require("./showmeyourname"),
    "pixelcord.textreplace": require("./textreplace"),
    "pixelcord.alwaystrust": require("./alwaystrust"),
    "pixelcord.friendssince": require("./friendssince"),
    "pixelcord.nopendingcount": require("./nopendingcount"),
    "pixelcord.nounblocktojump": require("./nounblocktojump"),
    "pixelcord.accountswitcher": require("./accountswitcher"),
    "pixelcord.platformspoofer": require("./platformspoofer"),
    "pixelcord.spotifylyricsstatus": require("./spotifylyricsstatus")
});

/**
 * @internal
 */
export function defineCorePlugin(instance: PluginInstanceInternal): PluginInstanceInternal {
    // @ts-expect-error
    instance[Symbol.for("bunny.core.plugin")] = true;
    return instance;
}
