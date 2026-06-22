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

const BADGES_URL = "https://api.pixelcord.com.br/badges.json";

const useBadgesModule = findByName("useBadges", false);

// The whole feed is one file, so fetch it once per session and share it for
// every profile instead of hitting the API per user.
let badgeMap: Record<string, PixelcordBadge[]> | null = null;
let badgeMapPromise: Promise<Record<string, PixelcordBadge[]>> | null = null;

function fetchBadgeMap(): Promise<Record<string, PixelcordBadge[]>> {
    if (badgeMap) return Promise.resolve(badgeMap);
    badgeMapPromise ??= fetch(BADGES_URL)
        .then(r => r.json())
        .then((map: Record<string, PixelcordBadge[]>) => (badgeMap = map ?? {}))
        .catch(() => (badgeMap = {}));
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
