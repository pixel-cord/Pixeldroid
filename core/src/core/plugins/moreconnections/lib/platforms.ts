// Custom profile platforms. Their ids are REAL Discord connection types, so when
// we inject them into a profile's connectedAccounts the Discord client renders
// them natively (proper icon, link, layout) — no custom UI needed on profiles.
// `icon` is only used by the manage UI tile.

export interface CustomPlatform {
    id: string;
    name: string;
    placeholder: string;
    icon: string;
    profileUrl: (value: string) => string;
    normalize: (raw: string) => string;
}

const handle = (raw: string) =>
    raw.trim().replace(/^@+/, "").replace(/[^A-Za-z0-9._-]/g, "").slice(0, 100);

export const PLATFORMS: CustomPlatform[] = [
    {
        id: "instagram",
        name: "Instagram",
        placeholder: "seu.user",
        icon: "https://cdn.simpleicons.org/instagram/E4405F",
        profileUrl: v => `https://www.instagram.com/${v}`,
        normalize: handle
    },
    {
        id: "lastfm",
        name: "Last.fm",
        placeholder: "seu-user",
        icon: "https://cdn.simpleicons.org/lastdotfm/D51007",
        profileUrl: v => `https://www.last.fm/user/${v}`,
        normalize: handle
    }
];

export const getPlatform = (id: string): CustomPlatform | undefined => PLATFORMS.find(p => p.id === id);
