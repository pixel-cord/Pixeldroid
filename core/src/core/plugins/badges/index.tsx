import { findAssetId } from "@lib/api/assets";
import { after } from "@lib/api/patcher";
import { createStorage, useObservable } from "@lib/api/storage";
import { showToast } from "@lib/ui/toasts";
import { lazyDestructure } from "@lib/utils/lazy";
import { findByName, findByProps, findByStoreName } from "@metro";
import { clipboard, url } from "@metro/common";
import { TableRow, TableRowGroup, TableSwitchRow } from "@metro/common/components";
import { useEffect, useState } from "react";
import { ScrollView } from "react-native";

import { defineCorePlugin } from "..";
import {
    API_URL,
    BADGE_FEEDS,
    BASE_URL,
    EQUICORD_CONTRIBUTOR_BADGE,
    PIXELCORD_CONTRIBUTOR_BADGE,
    VENCORD_CONTRIBUTOR_BADGE
} from "./lib/constants";
import { EQUICORD_CONTRIBUTORS, PIXELCORD_CONTRIBUTORS, VENCORD_CONTRIBUTORS } from "./lib/contributors";

// A badge as merged from the donor feeds. `source` is the feed key (vencord /
// equicord / pixelcord), used by the local hide filter. `hideId` is the
// desktop-matching badge id (`${source}_donor_badge_${i}`) — when the profile
// owner hides it (server-side), it must disappear here too, same as on PC.
interface PixelcordBadge {
    badge: string;
    tooltip: string;
    source: string;
    hideId: string;
}

// Contributor badges (shown for the hardcoded dev lists), rendered at the start
// of the badge row like desktop. Hidden as a group under the "contributors" key
// locally; `hideId` is the desktop id for the server-side per-user hide.
const CONTRIBUTOR_BADGES = [
    { map: PIXELCORD_CONTRIBUTORS, icon: PIXELCORD_CONTRIBUTOR_BADGE, label: "Pixelcord Contributor", hideId: "pixelcord_contributor_badge" },
    { map: EQUICORD_CONTRIBUTORS, icon: EQUICORD_CONTRIBUTOR_BADGE, label: "Equicord Contributor", hideId: "equicord_contributor_badge" },
    { map: VENCORD_CONTRIBUTORS, icon: VENCORD_CONTRIBUTOR_BADGE, label: "Vencord Contributor", hideId: "vencord_contributor_badge" }
];

// Feed key -> desktop donor-badge id prefix (matches hidebadges/feeds.ts).
const DONOR_PREFIX: Record<string, string> = {
    vencord: "vencord_donor_badge",
    equicord: "equicord_donor_badge",
    pixelcord: "pixelcord_donor_badge"
};

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
            const prefix = DONOR_PREFIX[feed.key];
            for (const userId in map) {
                (merged[userId] ??= []).push(
                    // index is per-feed so hideId matches the desktop scheme.
                    ...(map[userId] ?? []).map((b, i) => ({ ...b, source: feed.key, hideId: `${prefix}_${i}` }))
                );
            }
        }
        return (badgeMap = merged);
    }).catch(() => (badgeMap = {}));
    return badgeMapPromise;
}

// Per-user set of badge ids the OWNER hid (server-side, synced with desktop).
// Covers both our badge ids and Discord's native ones (staff, premium, …), so a
// hidden badge disappears for every Pixelcord viewer — exactly like the PC client.
let hiddenCache: Record<string, string[]> = {};
let hiddenPromises: Record<string, Promise<string[]>> = {};

const UserProfileStore = findByStoreName("UserProfileStore");

function fetchHidden(userId: string): Promise<string[]> {
    if (hiddenCache[userId]) return Promise.resolve(hiddenCache[userId]);
    hiddenPromises[userId] ??= fetch(`${API_URL}/hidden?ids=${encodeURIComponent(JSON.stringify([userId]))}`)
        .then(r => r.json())
        .then((d: Record<string, string[]>) => (hiddenCache[userId] = d?.[userId] ?? []))
        .catch(() => (hiddenCache[userId] = []));
    return hiddenPromises[userId];
}

// Drop cached hidden sets so the next profile render refetches, and nudge open
// profiles to re-render. Called on our own toggle (instant) and by the version
// poll (covers hides/unhides done elsewhere, e.g. on PC) — no app restart needed.
export function invalidateHidden(userId?: string) {
    if (userId) {
        delete hiddenCache[userId];
        delete hiddenPromises[userId];
    } else {
        hiddenCache = {};
        hiddenPromises = {};
    }
    try { (UserProfileStore as any)?.emitChange?.(); } catch { /* noop */ }
}

// Poll the lightweight version counter (same one the desktop uses). When it
// changes, anyone's hidden set / the donor feeds may have changed, so refresh.
let versionPoll: any = null;
let lastVersion: number | null = null;

async function pollVersion() {
    try {
        const { version } = await fetch(`${BASE_URL}/badges/version`).then(r => r.json());
        if (typeof version !== "number") return;
        if (lastVersion === null) { lastVersion = version; return; }
        if (version !== lastVersion) {
            lastVersion = version;
            badgeMap = null;
            badgeMapPromise = null;
            invalidateHidden();
        }
    } catch { /* backend unreachable; retry next tick */ }
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
        // Auto-refresh hidden sets / feeds without a restart (matches desktop's 20s poll).
        lastVersion = null;
        clearInterval(versionPoll);
        versionPoll = setInterval(pollVersion, 20000);

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
            const [hidden, setHidden] = useState<string[]>(
                user ? hiddenCache[user.userId] ?? [] : []
            );

            useEffect(() => {
                if (user) {
                    fetchBadgeMap().then(map => setBadges(map[user.userId] ?? []));
                    fetchHidden(user.userId).then(setHidden);
                }
            }, [user]);

            if (!user) return;

            const isOwnerHidden = (id: string) => hidden.includes(id);

            // Drop the profile owner's hidden NATIVE Discord badges (staff,
            // premium, active_developer…) — same global hide as the PC client.
            if (Array.isArray(r) && hidden.length) {
                for (let i = r.length - 1; i >= 0; i--) {
                    if (r[i] && isOwnerHidden(r[i].id)) r.splice(i, 1);
                }
            }

            // Build our badges, then unshift them so they sit IN FRONT of
            // Discord's native badges, matching the desktop client.
            const ours: any[] = [];

            // Contributor badges first (start position).
            if (!isHidden("contributors")) {
                CONTRIBUTOR_BADGES.forEach((c, ci) => {
                    const name = c.map[user.userId];
                    if (!name) return;
                    if (isOwnerHidden(c.hideId)) return; // owner hid it (server-side)
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
                if (isOwnerHidden(badge.hideId)) return; // owner hid it (server-side)
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
        clearInterval(versionPoll);
        versionPoll = null;
        unpatchers.forEach(u => u?.());
        unpatchers = [];
    }
});
