import { instead } from "@lib/api/patcher";
import { findByProps } from "@metro";

import { defineCorePlugin } from "..";

// Stops the client from sending typing indicators. Opt-in (preenabled = false)
// since some users want others to see them typing. Same stable Metro module
// the Vendetta/Bunny lineage has used for years.

let unpatch: (() => boolean) | undefined;

// Installed but OFF by default — the user toggles it in settings.
export const preenabled = false;

export default defineCorePlugin({
    manifest: {
        id: "pixelcord.silenttyping",
        name: "SilentTyping",
        version: "1.0.0",
        description: "Stops sending typing indicators to others",
        authors: [{ name: "Pixelcord Team" }]
    },
    start() {
        const Typing = findByProps("startTyping", "stopTyping");
        if (Typing?.startTyping) {
            unpatch = instead("startTyping", Typing, () => undefined);
        }
    },
    stop() {
        unpatch?.();
        unpatch = undefined;
    }
});
