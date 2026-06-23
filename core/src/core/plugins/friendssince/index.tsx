import { after } from "@lib/api/patcher";
import { findByProps, findByStoreName } from "@metro";
import { Text as MText } from "@metro/common/components";
import { View } from "react-native";

import { defineCorePlugin } from "..";

// FriendsSince (mobile). Shows the date you became friends with someone in their
// profile, like the desktop plugin. We jsx-wrap the profile's Note card (always
// present in a full profile) and prepend a small "Amigos desde …" line when the
// viewed user is a friend. Data comes from RelationshipStore.getSince. Opt-in.

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
        <View style={{ paddingHorizontal: 16, paddingBottom: 10, gap: 2 }}>
            <MText variant="eyebrow" color="text-muted">Amigos desde</MText>
            <MText variant="text-md/semibold">🤝 {text}</MText>
        </View>
    );
}

let unpatchers: Array<() => boolean> = [];

function inject(args: any[], ret: any) {
    try {
        const type = args?.[0];
        const name = type?.displayName || type?.name;
        if (name !== "UserProfileNote") return;
        const userId = args?.[1]?.userId;
        if (!userId) return;
        return (
            <View>
                <FriendsSinceLine userId={userId} />
                {ret}
            </View>
        );
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
