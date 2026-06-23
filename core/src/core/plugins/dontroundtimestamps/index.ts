import { findByProps } from "@metro";

import { defineCorePlugin } from "..";

// DontRoundMyTimestamps (mobile). Discord rounds relative timestamps to the
// nearest unit, so "7.6 years" shows as "8 years". We switch moment's rounding
// to Math.floor so it always rounds down (7y), matching the desktop plugin.
// moment exposes relativeTimeRounding as a static, so findByProps locates it.

const moment: any = findByProps("relativeTimeRounding");

export const preenabled = false;

export default defineCorePlugin({
    manifest: {
        id: "pixelcord.dontroundtimestamps",
        name: "DontRoundMyTimestamps",
        version: "1.0.0",
        description: "Arredonda os timestamps relativos pra baixo (7.6 anos vira 7, não 8).",
        authors: [{ name: "luvygor", id: "1499140821696647301" }]
    },
    start() {
        if (typeof moment?.relativeTimeRounding === "function") {
            moment.relativeTimeRounding(Math.floor);
        }
    },
    stop() {
        if (typeof moment?.relativeTimeRounding === "function") {
            moment.relativeTimeRounding(Math.round);
        }
    }
});
