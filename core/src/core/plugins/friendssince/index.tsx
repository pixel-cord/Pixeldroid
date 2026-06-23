import { after } from "@lib/api/patcher";
import { findByProps, findByStoreName } from "@metro";
import { Text as MText } from "@metro/common/components";
import { cloneElement } from "react";
import { Image, View } from "react-native";

import { defineCorePlugin } from "..";
import { FRIENDS_ICON } from "./icon";

// FriendsSince (mobile). Shows the date you became friends with someone in their
// profile, like the desktop plugin. We jsx-wrap the profile's About-me/Bio card
// (UserProfileAboutMeCard — it also holds "Membro desde", so it's effectively
// always present) and append a small "Amigos desde …" line right after it, so it
// sits just below the member-since date. Data: RelationshipStore.getSince. Opt-in.

const RelationshipStore: any = findByStoreName("RelationshipStore");
const jsxRuntime = findByProps("jsx", "jsxs");

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function formatSince(raw: any): string | null {
    try {
        const d = new Date(raw);
        if (isNaN(d.getTime())) return null;
        return `${d.getDate()} de ${MONTHS[d.getMonth()]}. de ${d.getFullYear()}`;
    } catch {
        return null;
    }
}

function FriendsSinceLine({ userId }: { userId: string; }) {
    if (!RelationshipStore?.isFriend?.(userId)) return null;
    const since = RelationshipStore.getSince?.(userId);
    const text = since ? formatSince(since) : null;
    if (!text) return null;
    return (
        <View style={{ paddingTop: 14, gap: 4 }}>
            <MText variant="eyebrow" color="text-muted">Amigos desde</MText>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Image
                    source={{ uri: FRIENDS_ICON }}
                    resizeMode="contain"
                    style={{ width: 16, height: 16, tintColor: "#b5bac1" }}
                />
                <MText variant="text-md/semibold">{text}</MText>
            </View>
        </View>
    );
}

let unpatchers: Array<() => boolean> = [];

function inject(args: any[], ret: any) {
    try {
        const type = args?.[0];
        const name = type?.displayName || type?.name;
        if (name !== "UserProfileAboutMeCard") return;
        const userId = args?.[1]?.userId;
        if (!userId) return;
        if (!RelationshipStore?.isFriend?.(userId)) return;
        // Insert the line as a child of the card itself (not a sibling) so it
        // shares the card background, sitting just below "Membro desde".
        const kids = ret?.props?.children;
        const arr = Array.isArray(kids) ? kids.slice() : (kids != null ? [kids] : []);
        arr.push(<FriendsSinceLine key="pc-friendssince" userId={userId} />);
        return cloneElement(ret, undefined, ...arr);
    } catch {
        return;
    }
}

export const preenabled = false;

export default defineCorePlugin({
    manifest: {
        id: "pixelcord.friendssince",
        name: "FriendsSince",
        version: "1.0.0",
        description: "Mostra desde quando vocês são amigos no perfil da pessoa.",
        authors: [{ name: "luvygor", id: "1499140821696647301" }]
    },
    start() {
        if (!jsxRuntime) return;
        unpatchers.push(after("jsx", jsxRuntime, inject));
        unpatchers.push(after("jsxs", jsxRuntime, inject));
    },
    stop() {
        unpatchers.forEach(u => u?.());
        unpatchers = [];
    }
});
