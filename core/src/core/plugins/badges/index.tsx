import { after } from "@lib/api/patcher";
import { onJsxCreate } from "@lib/api/react/jsx";
import { findByName } from "@metro";
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

export default defineCorePlugin({
    manifest: {
        id: "pixelcord.badges",
        name: "Badges",
        version: "1.0.0",
        description: "Adds Pixelcord badges to user's profile",
        authors: [{ name: "Pixelcord Team" }]
    },
    start() {
        const propHolder = {} as Record<string, any>;

        onJsxCreate("RenderedBadge", (_, ret) => {
            if (ret.props.id.match(/pixelcord-\d+-\d+/)) {
                Object.assign(ret.props, propHolder[ret.props.id]);
            }
        });

        after("default", useBadgesModule, ([user], r) => {
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
        });
    }
});
