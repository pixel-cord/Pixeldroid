import { after } from "@lib/api/patcher";
import { createStorage, useObservable } from "@lib/api/storage";
import { findByProps, findByStoreName } from "@metro";
import { TableRowGroup, TableSwitchRow, Text as MText } from "@metro/common/components";
import { ScrollView, Text, View } from "react-native";

import { defineCorePlugin } from "..";

// PlatformIndicators (mobile, v1). Shows which platform(s) a user is online on
// (📱 mobile / 🌐 web / 🖥️ desktop / 🎮 console) next to their name. Data comes
// from PresenceStore.getState().clientStatuses[userId] = { desktop?, mobile?,
// web?, embedded? }. Injected by wrapping the `Username` element (its props carry
// `userId`) on the JSX runtime — the same hook the badges plugin uses.

const PresenceStore = findByStoreName("PresenceStore");
const jsxRuntime = findByProps("jsx", "jsxs");

const EMOJI: Record<string, string> = {
    mobile: "📱",
    web: "🌐",
    desktop: "🖥️",
    embedded: "🎮"
};

interface PISettings {
    desktop: boolean;
}
const storage = createStorage<PISettings>("plugins/pixelcord.platformindicators/settings.json", {
    dflt: { desktop: false }
});

function platformsFor(userId: string): string[] {
    try {
        const cs = PresenceStore.getState()?.clientStatuses?.[userId];
        if (!cs) return [];
        return Object.keys(cs).filter(p => storage.desktop || p !== "desktop");
    } catch {
        return [];
    }
}

let unpatchers: Array<() => boolean> = [];

function inject(args: any[], ret: any) {
    try {
        const type = args?.[0];
        const name = type?.displayName || type?.name;
        if (name !== "Username" && name !== "DisplayName") return;

        const userId = args?.[1]?.userId ?? args?.[1]?.user?.id;
        if (!userId) return;

        const platforms = platformsFor(userId);
        if (!platforms.length) return;

        const icons = platforms.map(p => EMOJI[p]).filter(Boolean).join("");
        if (!icons) return;

        return (
            <View style={{ flexDirection: "row", alignItems: "center" }}>
                {ret}
                <Text style={{ fontSize: 11, marginLeft: 3 }}>{icons}</Text>
            </View>
        );
    } catch {
        return;
    }
}

function SettingsComponent() {
    useObservable([storage]);
    return (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingVertical: 16, gap: 16 }}>
            <MText variant="text-md/normal" color="text-muted" style={{ paddingHorizontal: 16 }}>
                Mostra a plataforma (📱 celular / 🌐 web / 🖥️ desktop / 🎮 console) do lado do nome.
            </MText>
            <TableRowGroup title="Opções">
                <TableSwitchRow
                    label="Mostrar desktop também"
                    subLabel="Por padrão só mostra celular/web/console (desktop é o comum)."
                    value={storage.desktop}
                    onValueChange={(v: boolean) => { storage.desktop = v; }}
                />
            </TableRowGroup>
        </ScrollView>
    );
}

export const preenabled = false;

export default defineCorePlugin({
    manifest: {
        id: "pixelcord.platformindicators",
        name: "PlatformIndicators",
        version: "1.0.0",
        description: "Mostra a plataforma (celular/web/desktop/console) em que a pessoa está online, do lado do nome.",
        authors: [{ name: "luvygor", id: "1499140821696647301" }]
    },
    SettingsComponent,
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
