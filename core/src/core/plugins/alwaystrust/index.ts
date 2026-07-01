import { instead } from "@lib/api/patcher";
import { findByStoreName } from "@metro";

import { defineCorePlugin } from "..";

// AlwaysTrust (mobile). Discord shows a "this link leads to an untrusted site"
// confirmation before opening external links it doesn't recognize. The desktop
// plugin forces MaskedLinkStore.isTrustedDomain to return true so the popup
// never appears. Same store exists on mobile, so we override it directly.
// (The desktop file-download and delete-server-safety parts are desktop-only.)
// Opt-in (preenabled = false).

const MaskedLinkStore: any = findByStoreName("MaskedLinkStore");

let unpatch: (() => boolean) | undefined;

export const preenabled = false;

export default defineCorePlugin({
    manifest: {
        id: "pixelcord.alwaystrust",
        name: "AlwaysTrust",
        version: "1.0.0",
        description: "Remove o aviso de \"site não confiável\" ao abrir links externos.",
        authors: [{ name: "myvings", id: "73598582153805824" }]
    },
    start() {
        if (typeof MaskedLinkStore?.isTrustedDomain === "function") {
            unpatch = instead("isTrustedDomain", MaskedLinkStore, () => true);
        }
    },
    stop() {
        unpatch?.();
        unpatch = undefined;
    }
});
