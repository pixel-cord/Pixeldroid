// Pixelcord backend — same endpoints the desktop client uses. The donate flow
// (PIX / Litecoin) lives under /api. Mobile donates without OAuth: the charge is
// attributed straight to the donor's Discord id, no login needed.
export const BASE_URL = "https://api.pixelcord.com.br";
export const API_URL = `${BASE_URL}/api`;

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
