import { before } from "@lib/api/patcher";
import { findByProps } from "@metro";

import { defineCorePlugin } from "..";

// Strips tracking parameters from links in the messages you send (and edit).
// Self-contained: a built-in blocklist + plain regex, no external rules fetch and
// no reliance on the URL/searchParams APIs (which are flaky on Hermes).
export const preenabled = false;

const MessageActions = findByProps("sendMessage", "editMessage");

// Exact tracking params to drop, plus prefix families handled in isTracking().
const EXACT = new Set([
    "fbclid", "gclid", "dclid", "gbraid", "wbraid", "msclkid", "yclid", "twclid",
    "igshid", "igsh", "mc_eid", "mc_cid", "_openstat", "vero_id", "vero_conv",
    "oly_enc_id", "oly_anon_id", "ref_src", "ref_url", "s_kwcid", "icid",
    "__twitter_impression", "_hsenc", "_hsmi", "spm", "scm"
]);

function isTracking(key: string): boolean {
    const k = key.toLowerCase();
    return EXACT.has(k) || k.startsWith("utm_") || k.startsWith("hsa_") || k.startsWith("pk_") || k.startsWith("mtm_");
}

function cleanUrl(u: string): string {
    const hashIdx = u.indexOf("#");
    const hash = hashIdx >= 0 ? u.slice(hashIdx) : "";
    const noHash = hashIdx >= 0 ? u.slice(0, hashIdx) : u;

    const qIdx = noHash.indexOf("?");
    if (qIdx < 0) return u;

    const base = noHash.slice(0, qIdx);
    const kept = noHash.slice(qIdx + 1).split("&").filter(p => p && !isTracking(p.split("=")[0]));
    return base + (kept.length ? "?" + kept.join("&") : "") + hash;
}

function clean(text: string): string {
    return text.replace(/(https?:\/\/[^\s<]+[^<.,:;"'>)|\]\s])/g, cleanUrl);
}

let unpatchSend: (() => boolean) | undefined;
let unpatchEdit: (() => boolean) | undefined;

export default defineCorePlugin({
    manifest: {
        id: "pixelcord.clearurls",
        name: "ClearURLs",
        version: "1.0.0",
        description: "Remove parâmetros de rastreamento (utm_*, fbclid, igshid, etc.) dos links que você envia.",
        authors: [{ name: "myvings", id: "73598582153805824" }]
    },
    start() {
        unpatchSend = before("sendMessage", MessageActions, (args: any[]) => {
            const msg = args[1];
            if (msg && typeof msg.content === "string" && msg.content.includes("http")) {
                msg.content = clean(msg.content);
            }
        });
        unpatchEdit = before("editMessage", MessageActions, (args: any[]) => {
            const msg = args[2];
            if (msg && typeof msg.content === "string" && msg.content.includes("http")) {
                msg.content = clean(msg.content);
            }
        });
    },
    stop() {
        unpatchSend?.();
        unpatchEdit?.();
        unpatchSend = unpatchEdit = undefined;
    }
});
