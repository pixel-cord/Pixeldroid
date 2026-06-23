import { after } from "@lib/api/patcher";
import { createStorage, useObservable } from "@lib/api/storage";
import { findByProps, findByStoreName } from "@metro";
import { TableRowGroup, TableSwitchRow, Text as MText } from "@metro/common/components";
import { Image, ScrollView, View } from "react-native";

import { defineCorePlugin } from "..";
import { PLATFORM_ICONS } from "./icons";

// PlatformIndicators (mobile, v2). Shows which platform(s) a user is online on
// next to their name, using the desktop plugin's SVG icons rasterized to PNG
// (mobile = platform-svgs/cell-options/G_portrait.svg), tinted by the status
// color. Data: PresenceStore.getState().clientStatuses[userId] = { desktop?,
// mobile?, web?, embedded? } -> status string. Injected by wrapping the
// `Username`/`DisplayName` element (props carry userId) on the JSX runtime.

const PresenceStore = findByStoreName("PresenceStore");
const jsxRuntime = findByProps("jsx", "jsxs");

const STATUS_COLOR: Record<string, string> = {
    online: "#23A55A",
    idle: "#F0B232",
    dnd: "#F23F43"
};
const statusColor = (s: string) => STATUS_COLOR[s] ?? "#80848E";

const ICON_H = 13;

interface PISettings {
    desktop: boolean;
}
const storage = createStorage<PISettings>("plugins/pixelcord.platformindicators/settings.json", {
    dflt: { desktop: false }
});

let unpatchers: Array<() => boolean> = [];

function inject(args: any[], ret: any) {
    try {
        const type = args?.[0];
        const name = type?.displayName || type?.name;
        if (name !== "Username" && name !== "DisplayName") return;

        const userId = args?.[1]?.userId ?? args?.[1]?.user?.id;
        if (!userId) return;

        const cs = PresenceStore.getState()?.clientStatuses?.[userId];
        if (!cs) return;
        const platforms = Object.entries(cs).filter(([p]) => storage.desktop || p !== "desktop");
        if (!platforms.length) return;

        return (
            <View style={{ flexDirection: "row", alignItems: "center" }}>
                {ret}
                {platforms.map(([p, status]) => {
                    const ic = PLATFORM_ICONS[p];
                    if (!ic) return null;
                    return (
                        <Image
                            key={p}
                            source={{ uri: ic.uri }}
                            resizeMode="contain"
                            style={{ height: ICON_H, width: ICON_H * ic.aspect, marginLeft: 3, tintColor: statusColor(String(status)) }}
                        />
                    );
                })}
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
                Mostra a plataforma (celular / web / desktop / console) em que a pessoa está online,
                do lado do nome, na cor do status.
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
        version: "1.1.0",
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
