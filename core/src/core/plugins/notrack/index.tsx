import { instead } from "@lib/api/patcher";
import { findByProps } from "@metro";

import { defineCorePlugin } from "..";

// Proof-of-concept mobile plugin: blocks Discord's analytics/telemetry.
// Demonstrates the full RN plugin flow — find a Metro module and patch it.
// Discord's analytics module exposes `track`; we replace it with a no-op so
// no tracking events are ever sent.

let unpatch: (() => boolean) | undefined;

export default defineCorePlugin({
    manifest: {
        id: "pixelcord.notrack",
        name: "NoTrack",
        version: "1.0.0",
        description: "Blocks Discord's analytics and tracking",
        authors: [{ name: "luvygor", id: "1499140821696647301" }]
    },
    start() {
        const Analytics = findByProps("track", "trackNetworkAction");
        if (Analytics?.track) {
            unpatch = instead("track", Analytics, () => undefined);
        }
    },
    stop() {
        unpatch?.();
        unpatch = undefined;
    }
});
