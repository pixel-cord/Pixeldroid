// Pixelcord backend — same endpoints the desktop client uses. The donate flow
// (PIX / Litecoin) and OAuth config all live under /api.
export const BASE_URL = "https://api.pixelcord.com.br";
export const API_URL = `${BASE_URL}/api`;

// Filled in from /api/config at runtime (the OAuth client id + the registered
// redirect uri). `export let` is intentional — loadApiConfig() updates them.
export let AUTHORIZE_URL = `${API_URL}/authorize`;
export let CLIENT_ID = "";

// Donor feeds aggregated on profiles, same as desktop.
export const BADGE_FEEDS = [
    { key: "vencord", name: "Vencord", url: "https://badges.vencord.dev/badges.json" },
    { key: "equicord", name: "Equicord", url: "https://badge.equicord.org/badges.json" },
    { key: "pixelcord", name: "Pixelcord", url: `${BASE_URL}/badges.json` }
];

// Contributor badge icons (shown for the hardcoded dev lists in contributors.ts).
export const VENCORD_CONTRIBUTOR_BADGE = "https://cdn.discordapp.com/emojis/1092089799109775453.png?size=64";
export const EQUICORD_CONTRIBUTOR_BADGE = "https://equicord.org/assets/favicon.png";
export const PIXELCORD_CONTRIBUTOR_BADGE = "https://cdn.pixelcord.com.br/uploads/image-a005087cdafda23dabae78aae6f81908.png";

export async function loadApiConfig() {
    try {
        const config = await fetch(`${API_URL}/config`).then(r => r.json());
        if (config.clientId) CLIENT_ID = config.clientId;
        if (config.redirectUri) AUTHORIZE_URL = config.redirectUri;
    } catch {
        // backend unreachable; donate will surface the error when the user tries
    }
}
