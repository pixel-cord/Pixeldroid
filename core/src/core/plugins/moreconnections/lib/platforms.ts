// Custom profile platforms. Their ids are REAL Discord connection types, so when
// we inject them into a profile's connectedAccounts the Discord client renders
// them natively (proper icon, link, layout) on the profile. `asset`/`color` are
// only used by the manage UI tile: `asset` is a native Discord asset name (used
// via findAssetId); platforms without one fall back to a brand-colored tile.

import { LASTFM_ICON } from "./lastfmIcon";

export interface CustomPlatform {
    id: string;
    name: string;
    placeholder: string;
    /** Native Discord asset name for the manage-UI tile, if Discord bundles one. */
    asset?: string;
    /** Embedded image (data URI) for platforms with no native asset, drawn on the tile. */
    iconData?: string;
    /** Brand color for the tile (background behind iconData, or fallback). */
    color: string;
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
        asset: "img_account_sync_instagram_light_and_dark",
        color: "#E4405F",
        profileUrl: v => `https://www.instagram.com/${v}`,
        normalize: handle
    },
    {
        id: "lastfm",
        name: "Last.fm",
        placeholder: "seu-user",
        iconData: LASTFM_ICON,
        color: "#D51007",
        profileUrl: v => `https://www.last.fm/user/${v}`,
        normalize: handle
    }
];

export const getPlatform = (id: string): CustomPlatform | undefined => PLATFORMS.find(p => p.id === id);
