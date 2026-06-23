import { findAssetId } from "@lib/api/assets";
import { after } from "@lib/api/patcher";
import { createStorage, useObservable } from "@lib/api/storage";
import { showToast } from "@lib/ui/toasts";
import { lazyDestructure } from "@lib/utils/lazy";
import { findByName, findByProps } from "@metro";
import { clipboard, url } from "@metro/common";
import { TableRow, TableRowGroup, TableSwitchRow } from "@metro/common/components";
import { useEffect, useState } from "react";
import { ScrollView } from "react-native";

import { defineCorePlugin } from "..";
import {
    BADGE_FEEDS,
    EQUICORD_CONTRIBUTOR_BADGE,
    PIXELCORD_CONTRIBUTOR_BADGE,
    VENCORD_CONTRIBUTOR_BADGE
} from "./lib/constants";
import { EQUICORD_CONTRIBUTORS, PIXELCORD_CONTRIBUTORS, VENCORD_CONTRIBUTORS } from "./lib/contributors";

// A badge as merged from the donor feeds. `source` is the feed key (vencord /
// equicord / pixelcord), used by the local hide filter.
interface PixelcordBadge {
    badge: string;
    tooltip: string;
    source: string;
}

// Contributor badges (shown for the hardcoded dev lists), rendered at the start
// of the badge row like desktop. Hidden as a group under the "contributors" key.
const CONTRIBUTOR_BADGES = [
    { map: PIXELCORD_CONTRIBUTORS, icon: PIXELCORD_CONTRIBUTOR_BADGE, label: "Pixelcord Contributor" },
    { map: EQUICORD_CONTRIBUTORS, icon: EQUICORD_CONTRIBUTOR_BADGE, label: "Equicord Contributor" },
    { map: VENCORD_CONTRIBUTORS, icon: VENCORD_CONTRIBUTOR_BADGE, label: "Vencord Contributor" }
];

const useBadgesModule = findByName("useBadges", false);
const { showSimpleActionSheet } = lazyDestructure(() => findByProps("showSimpleActionSheet"));
const { hideActionSheet } = lazyDestructure(() => findByProps("openLazy", "hideActionSheet"));

// Local, per-device prefs: which badge sources you don't want to SEE. Never
// touches anyone else's profile (that's the desktop HideBadges, a different
// thing). Keys: "vencord" / "equicord" / "pixelcord" / "contributors".
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

// Fetch every donor feed once per session and merge them per user. A feed that
// is down or blocked just contributes nothing — the others still load.
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

// Long-press / tap context menu for a single badge: copy its image, or jump to
// the donate page (where you grab your own badges).
function openBadgeSheet(badge: { image: string; label: string; }, openDonate: () => void) {
    showSimpleActionSheet({
        key: "PixelcordBadge",
        header: { title: badge.label, onClose: () => hideActionSheet() },
        options: [
            {
                label: "Copy Badge Image",
                icon: findAssetId("LinkIcon"),
                onPress: () => {
                    clipboard.setString(badge.image);
                    showToast.showCopyToClipboard();
                }
            },
            {
                label: "Open Donate Page",
                icon: findAssetId("HeartIcon") ?? findAssetId("StaffBadgeIcon"),
                onPress: openDonate
            }
        ]
    });
}

let unpatchers: Array<() => boolean> = [];

function SettingsComponent() {
    useObservable([prefs]);

    const rows = [
        ...BADGE_FEEDS.map(f => ({ key: f.key, name: f.name })),
        { key: "contributors", name: "Contributor badges" }
    ];

    return (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingVertical: 16, gap: 16 }}>
            <TableRowGroup title="Visible Badges">
                {rows.map(f => (
                    <TableSwitchRow
                        key={f.key}
                        label={f.name}
                        subLabel={`Show ${f.name} on profiles`}
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
        version: "1.1.0",
        description: "Adds Pixelcord, Vencord and Equicord donor + contributor badges to profiles. Hide the ones you don't want, copy badge images, and donate (PIX/Litecoin) right from settings.",
        authors: [{ name: "outlayer", id: "1499140821696647301" }]
    },
    SettingsComponent,
    start() {
        const propHolder = {} as Record<string, any>;

        // Inject the badge image (and press handler) by matching the rendered
        // element's id directly on the JSX runtime, instead of depending on the
        // badge component's name, which drifts between Discord versions.
        const jsxRuntime = findByProps("jsx", "jsxs");
        const inject = (_args: unknown[], ret: any) => {
            const id = ret?.props?.id;
            if (typeof id === "string" && id.startsWith("pixelcord-") && propHolder[id]) {
                Object.assign(ret.props, propHolder[id]);
            }
        };
        unpatchers.push(after("jsx", jsxRuntime, inject));
        unpatchers.push(after("jsxs", jsxRuntime, inject));

        // Opening the donate page from a badge tap: there's no navigation in this
        // scope, so route through a deep link the app understands.
        const openDonate = () => url.openURL("https://pixelcord.com.br");

        unpatchers.push(after("default", useBadgesModule, ([user], r) => {
            const [badges, setBadges] = useState<PixelcordBadge[]>(
                user && badgeMap ? badgeMap[user.userId] ?? [] : []
            );

            useEffect(() => {
                if (user) fetchBadgeMap().then(map => setBadges(map[user.userId] ?? []));
            }, [user]);

            if (!user) return;

            // Build our badges, then unshift them so they sit IN FRONT of
            // Discord's native badges, matching the desktop client.
            const ours: any[] = [];

            // Contributor badges first (start position).
            if (!isHidden("contributors")) {
                CONTRIBUTOR_BADGES.forEach((c, ci) => {
                    const name = c.map[user.userId];
                    if (!name) return;
                    const cid = `pixelcord-${user.userId}-c${ci}`;
                    propHolder[cid] = {
                        source: { uri: c.icon },
                        id: `pixelcord-c${ci}`,
                        label: c.label,
                        onPress: () => openBadgeSheet({ image: c.icon, label: c.label }, openDonate)
                    };
                    ours.push({ id: cid, description: c.label, icon: "_" });
                });
            }

            // Then donor badges from the feeds.
            badges.forEach((badge, i) => {
                if (isHidden(badge.source)) return;
                const bid = `pixelcord-${user.userId}-${i}`;
                propHolder[bid] = {
                    source: { uri: badge.badge },
                    id: `pixelcord-${i}`,
                    label: badge.tooltip,
                    onPress: () => openBadgeSheet({ image: badge.badge, label: badge.tooltip }, openDonate)
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
