import { after } from "@lib/api/patcher";
import { findByName, findByProps } from "@metro";
import { useEffect, useState } from "react";

import { defineCorePlugin } from "..";

// Pixelcord badge feed. Single JSON object keyed by user id, each value an
// array of { badge (image url), tooltip (label) }. Same endpoint the desktop
// client uses, so badges stay in sync across platforms.
interface PixelcordBadge {
    badge: string;
    tooltip: string;
}

// Same three feeds the desktop client aggregates: Vencord + Equicord donor
// badges plus our own. Each feed is { userId: [{ badge, tooltip }] }.
const BADGE_FEEDS = [
    "https://badges.vencord.dev/badges.json",
    "https://badge.equicord.org/badges.json",
    "https://api.pixelcord.com.br/badges.json"
];

// Pixelcord contributor badge — shown for the hardcoded contributor IDs below
// (code contributors), separate from the donor feeds. Add IDs as needed.
const CONTRIBUTOR_BADGE = "https://cdn.pixelcord.com.br/uploads/image-a005087cdafda23dabae78aae6f81908.png";
const CONTRIBUTORS: Record<string, string> = {
    "1499140821696647301": "Pixelcord Contributor" // outlayer
};

const useBadgesModule = findByName("useBadges", false);

// Fetch every feed once per session and merge them per user. A feed that is
// down or blocked just contributes nothing — the others still load.
let badgeMap: Record<string, PixelcordBadge[]> | null = null;
let badgeMapPromise: Promise<Record<string, PixelcordBadge[]>> | null = null;

function fetchBadgeMap(): Promise<Record<string, PixelcordBadge[]>> {
    if (badgeMap) return Promise.resolve(badgeMap);
    badgeMapPromise ??= Promise.all(
        BADGE_FEEDS.map(url => fetch(url).then(r => r.json()).catch(() => ({})))
    ).then((maps: Record<string, PixelcordBadge[]>[]) => {
        const merged: Record<string, PixelcordBadge[]> = {};
        for (const map of maps) {
            for (const userId in map) {
                (merged[userId] ??= []).push(...(map[userId] ?? []));
            }
        }
        return (badgeMap = merged);
    }).catch(() => (badgeMap = {}));
    return badgeMapPromise;
}

let unpatchers: Array<() => boolean> = [];

export default defineCorePlugin({
    manifest: {
        id: "pixelcord.badges",
        name: "Badges",
        version: "1.0.0",
        description: "Adds Pixelcord badges to user's profile",
        authors: [{ name: "outlayer", id: "1499140821696647301" }]
    },
    start() {
        const propHolder = {} as Record<string, any>;

        // Inject the badge image by matching the rendered element's id directly
        // on the JSX runtime, instead of depending on the badge component's name
        // (e.g. "RenderedBadge"), which drifts between Discord versions. This way
        // it works regardless of what component actually renders the badge.
        const jsxRuntime = findByProps("jsx", "jsxs");
        const inject = (_args: unknown[], ret: any) => {
            const id = ret?.props?.id;
            if (typeof id === "string" && id.startsWith("pixelcord-") && propHolder[id]) {
                Object.assign(ret.props, propHolder[id]);
            }
        };
        unpatchers.push(after("jsx", jsxRuntime, inject));
        unpatchers.push(after("jsxs", jsxRuntime, inject));

        unpatchers.push(after("default", useBadgesModule, ([user], r) => {
            const [badges, setBadges] = useState<PixelcordBadge[]>(
                user && badgeMap ? badgeMap[user.userId] ?? [] : []
            );

            useEffect(() => {
                if (user) {
                    fetchBadgeMap().then(map => setBadges(map[user.userId] ?? []));
                }
            }, [user]);

            if (user) {
                // Contributor badge first (start position), like the desktop client.
                if (CONTRIBUTORS[user.userId]) {
                    const cid = `pixelcord-${user.userId}-c`;
                    propHolder[cid] = {
                        source: { uri: CONTRIBUTOR_BADGE },
                        id: "pixelcord-c",
                        label: CONTRIBUTORS[user.userId]
                    };
                    r.push({ id: cid, description: CONTRIBUTORS[user.userId], icon: "_" });
                }

                badges.forEach((badge, i) => {
                    propHolder[`pixelcord-${user.userId}-${i}`] = {
                        source: { uri: badge.badge },
                        id: `pixelcord-${i}`,
                        label: badge.tooltip
                    };

                    r.push({
                        id: `pixelcord-${user.userId}-${i}`,
                        description: badge.tooltip,
                        icon: "_",
                    });
                });
            }
        }));
    },
    stop() {
        unpatchers.forEach(u => u?.());
        unpatchers = [];
    }
});
