import { after } from "@lib/api/patcher";
import { findAssetId } from "@lib/api/assets";
import { createStorage, useObservable } from "@lib/api/storage";
import { showToast } from "@lib/ui/toasts";
import { lazyDestructure } from "@lib/utils/lazy";
import { findByName, findByProps } from "@metro";
import { clipboard, url } from "@metro/common";
import { TableRow, TableRowGroup, TableSwitchRow } from "@metro/common/components";
import { useEffect, useState } from "react";
import { ScrollView } from "react-native";

import { defineCorePlugin } from "..";

// Pixelcord badge feed. Each feed is a JSON object keyed by user id, each value
// an array of { badge (image url), tooltip (label) }. Same endpoints the desktop
// client aggregates so badges stay in sync across platforms.
interface PixelcordBadge {
    badge: string;
    tooltip: string;
    source: string; // which feed it came from (used by the hide-badges filter)
}

// The three donor feeds: Vencord + Equicord + our own. `key` is the toggle id
// used by the "Visible Badges" setting; `name` is the label shown there.
const BADGE_FEEDS = [
    { key: "vencord", name: "Vencord", url: "https://badges.vencord.dev/badges.json" },
    { key: "equicord", name: "Equicord", url: "https://badge.equicord.org/badges.json" },
    { key: "pixelcord", name: "Pixelcord", url: "https://api.pixelcord.com.br/badges.json" }
];

// Pixelcord contributor badge — shown for the hardcoded contributor IDs below
// (code contributors), separate from the donor feeds. Add IDs as needed.
const CONTRIBUTOR_BADGE = "https://cdn.pixelcord.com.br/uploads/image-a005087cdafda23dabae78aae6f81908.png";
const CONTRIBUTORS: Record<string, string> = {
    "1499140821696647301": "Pixelcord Contributor" // outlayer
};

// Where the "Donate" button in settings (and the badge context menu) sends you.
const DONATE_URL = "https://pixelcord.com.br";

const useBadgesModule = findByName("useBadges", false);
const { showSimpleActionSheet } = lazyDestructure(() => findByProps("showSimpleActionSheet"));
const { hideActionSheet } = lazyDestructure(() => findByProps("openLazy", "hideActionSheet"));

// Per-user local prefs. `hidden` maps a feed key (or "contributor") to true when
// the user doesn't want to SEE badges from that source — purely client-side, it
// never touches anyone else's profile.
interface BadgePrefs {
    hidden: Record<string, boolean>;
}
const prefs = createStorage<BadgePrefs>("plugins/pixelcord.badges/prefs.json", {
    dflt: { hidden: {} }
});

function isHidden(key: string): boolean {
    try {
        return !!prefs.hidden?.[key];
    } catch {
        return false;
    }
}

// Fetch every feed once per session and merge them per user. A feed that is
// down or blocked just contributes nothing — the others still load.
let badgeMap: Record<string, PixelcordBadge[]> | null = null;
let badgeMapPromise: Promise<Record<string, PixelcordBadge[]>> | null = null;

function fetchBadgeMap(): Promise<Record<string, PixelcordBadge[]>> {
    if (badgeMap) return Promise.resolve(badgeMap);
    badgeMapPromise ??= Promise.all(
        BADGE_FEEDS.map(feed =>
            fetch(feed.url)
                .then(r => r.json())
                .then((map: Record<string, { badge: string; tooltip: string; }[]>) => ({ feed, map }))
                .catch(() => ({ feed, map: {} as Record<string, { badge: string; tooltip: string; }[]> }))
        )
    ).then(results => {
        const merged: Record<string, PixelcordBadge[]> = {};
        for (const { feed, map } of results) {
            for (const userId in map) {
                (merged[userId] ??= []).push(
                    ...(map[userId] ?? []).map(b => ({ ...b, source: feed.key }))
                );
            }
        }
        return (badgeMap = merged);
    }).catch(() => (badgeMap = {}));
    return badgeMapPromise;
}

// Long-press / tap context menu for a single badge: copy its image or open the
// donor page (where you grab your own badges).
function openBadgeSheet(badge: { badge: string; label: string; }) {
    showSimpleActionSheet({
        key: "PixelcordBadge",
        header: {
            title: badge.label,
            onClose: () => hideActionSheet()
        },
        options: [
            {
                label: "Copy Badge Image",
                icon: findAssetId("LinkIcon"),
                onPress: () => {
                    clipboard.setString(badge.badge);
                    showToast.showCopyToClipboard();
                }
            },
            {
                label: "Open Donor Page",
                icon: findAssetId("HeartIcon") ?? findAssetId("StaffBadgeIcon"),
                onPress: () => url.openURL(DONATE_URL)
            }
        ]
    });
}

let unpatchers: Array<() => boolean> = [];

function SettingsComponent() {
    useObservable([prefs]);

    const rows = [...BADGE_FEEDS, { key: "contributor", name: "Pixelcord Contributor" }];

    return (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingVertical: 16, gap: 16 }}>
            <TableRowGroup title="Support Pixelcord">
                <TableRow
                    label="Donate"
                    subLabel="Support Pixelcord and unlock your own badges"
                    icon={<TableRow.Icon source={findAssetId("HeartIcon") ?? findAssetId("StaffBadgeIcon")} />}
                    onPress={() => url.openURL(DONATE_URL)}
                />
            </TableRowGroup>
            <TableRowGroup title="Visible Badges">
                {rows.map(f => (
                    <TableSwitchRow
                        key={f.key}
                        label={f.name}
                        subLabel={`Show ${f.name} badges on profiles`}
                        icon={<TableRow.Icon source={findAssetId("StaffBadgeIcon")} />}
                        value={!isHidden(f.key)}
                        onValueChange={(v: boolean) => {
                            prefs.hidden ??= {};
                            prefs.hidden[f.key] = !v;
                        }}
                    />
                ))}
            </TableRowGroup>
        </ScrollView>
    );
}

export default defineCorePlugin({
    manifest: {
        id: "pixelcord.badges",
        name: "Badges",
        version: "1.0.0",
        description: "Adds Pixelcord, Vencord and Equicord badges to profiles. Hide the ones you don't want, copy badge images, and donate right from settings.",
        authors: [{ name: "outlayer", id: "1499140821696647301" }]
    },
    SettingsComponent,
    start() {
        const propHolder = {} as Record<string, any>;

        // Inject the badge image (and press handler) by matching the rendered
        // element's id directly on the JSX runtime, instead of depending on the
        // badge component's name (e.g. "RenderedBadge"), which drifts between
        // Discord versions. This works regardless of what renders the badge.
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

            if (!user) return;

            // Build our badges then unshift them so they sit IN FRONT of
            // Discord's native badges, matching the desktop client.
            const ours: any[] = [];

            // Contributor badge first (start position), like the desktop client.
            if (CONTRIBUTORS[user.userId] && !isHidden("contributor")) {
                const cid = `pixelcord-${user.userId}-c`;
                propHolder[cid] = {
                    source: { uri: CONTRIBUTOR_BADGE },
                    id: "pixelcord-c",
                    label: CONTRIBUTORS[user.userId],
                    onPress: () => openBadgeSheet({ badge: CONTRIBUTOR_BADGE, label: CONTRIBUTORS[user.userId] })
                };
                ours.push({ id: cid, description: CONTRIBUTORS[user.userId], icon: "_" });
            }

            badges.forEach((badge, i) => {
                if (isHidden(badge.source)) return;

                const bid = `pixelcord-${user.userId}-${i}`;
                propHolder[bid] = {
                    source: { uri: badge.badge },
                    id: `pixelcord-${i}`,
                    label: badge.tooltip,
                    onPress: () => openBadgeSheet({ badge: badge.badge, label: badge.tooltip })
                };

                ours.push({ id: bid, description: badge.tooltip, icon: "_" });
            });

            if (ours.length) r.unshift(...ours);
        }));
    },
    stop() {
        unpatchers.forEach(u => u?.());
        unpatchers = [];
    }
});
