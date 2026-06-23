import { findByStoreName } from "@metro";

import {
    BADGE_FEEDS,
    EQUICORD_CONTRIBUTOR_BADGE,
    PIXELCORD_CONTRIBUTOR_BADGE,
    VENCORD_CONTRIBUTOR_BADGE
} from "../badges/lib/constants";
import { EQUICORD_CONTRIBUTORS, PIXELCORD_CONTRIBUTORS, VENCORD_CONTRIBUTORS } from "../badges/lib/contributors";

const UserStore = findByStoreName("UserStore");

// One badge in the user's manageable list. `id` MUST match the desktop client's
// badge id scheme so the hidden set stays in sync across PC and mobile:
//   donor:       `${vencord|equicord|pixelcord}_donor_badge_${index}`
//   contributor: `${vencord|equicord|pixelcord}_contributor_badge`
export interface ManageableBadge {
    id: string;
    label: string;
    icon: string;
}

// Feed key -> desktop donor-badge id prefix.
const DONOR_PREFIX: Record<string, string> = {
    vencord: "vencord_donor_badge",
    equicord: "equicord_donor_badge",
    pixelcord: "pixelcord_donor_badge"
};

const CONTRIBS = [
    { map: PIXELCORD_CONTRIBUTORS, id: "pixelcord_contributor_badge", icon: PIXELCORD_CONTRIBUTOR_BADGE, label: "Pixelcord Contributor" },
    { map: EQUICORD_CONTRIBUTORS, id: "equicord_contributor_badge", icon: EQUICORD_CONTRIBUTOR_BADGE, label: "Equicord Contributor" },
    { map: VENCORD_CONTRIBUTORS, id: "vencord_contributor_badge", icon: VENCORD_CONTRIBUTOR_BADGE, label: "Vencord Contributor" }
];

// Fetch the current user's badges from every feed and build the manageable list
// with desktop-matching ids. Mirrors how the desktop builds badge ids so hiding
// one here hides the same badge there.
export async function fetchMyBadges(): Promise<ManageableBadge[]> {
    const me = UserStore.getCurrentUser()?.id;
    if (!me) return [];

    const out: ManageableBadge[] = [];

    for (const c of CONTRIBS) {
        if (c.map[me]) out.push({ id: c.id, label: c.label, icon: c.icon });
    }

    const feedData = await Promise.all(
        BADGE_FEEDS.map(feed =>
            fetch(feed.url)
                .then(r => r.json())
                .then((map: Record<string, { badge: string; tooltip: string; }[]>) => ({ feed, list: map[me] ?? [] }))
                .catch(() => ({ feed, list: [] as { badge: string; tooltip: string; }[] }))
        )
    );

    for (const { feed, list } of feedData) {
        const prefix = DONOR_PREFIX[feed.key];
        list.forEach((b, i) => out.push({ id: `${prefix}_${i}`, label: b.tooltip || feed.name, icon: b.badge }));
    }

    return out;
}
