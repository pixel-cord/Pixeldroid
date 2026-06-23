import { after } from "@lib/api/patcher";
import { createStorage, useObservable } from "@lib/api/storage";
import { findByProps, findByStoreName } from "@metro";
import { FluxUtils } from "@metro/common";
import { TableRow, TableRowGroup, TableSwitchRow, Text as MText } from "@metro/common/components";
import { Image, ScrollView, View } from "react-native";

import { defineCorePlugin } from "..";
import { CONSOLE_ICONS, PLATFORM_ICONS } from "./icons";

// PlatformIndicators (mobile, v3). Shows which platform(s) a user is online on
// next to their name, using the desktop plugin's SVG icons (mobile = G_portrait),
// tinted by status. Reactive via useStateFromStores([PresenceStore]) so it follows
// status/device changes live. Shown only in the profile by default; toggles add
// chat/member-list, color the mobile indicator, include bots, and pick the console
// (embedded) icon. Profile is detected by wrapping UserProfilePrimaryInfo so the
// name rendered inside it is tagged as profile.

const PresenceStore = findByStoreName("PresenceStore");
const UserStore = findByStoreName("UserStore");
const jsxRuntime = findByProps("jsx", "jsxs");

// Resolve the other user in a 1:1 DM channel (skip group DMs / guild channels).
function dmRecipient(channel: any): string | null {
    if (!channel) return null;
    if (channel.type !== undefined && channel.type !== 1) return null; // 1 = DM
    const r = channel.recipients;
    if (Array.isArray(r) && r.length === 1) {
        return typeof r[0] === "string" ? r[0] : (r[0]?.id ?? null);
    }
    if (typeof channel.getRecipientId === "function") {
        try { return channel.getRecipientId(); } catch { /* ignore */ }
    }
    return null;
}

const STATUS_COLOR: Record<string, string> = {
    online: "#23A55A",
    idle: "#F0B232",
    dnd: "#F23F43"
};
const statusColor = (s: string) => STATUS_COLOR[s] ?? "#80848E";
const ICON_H = 13;

interface PISettings {
    profile: boolean;
    elsewhere: boolean;   // chat + member list
    dms: boolean;         // DM list on the home screen
    colorMobile: boolean;
    bots: boolean;
    consoleIcon: string;  // "default" | "vencord" | "suncord" | "pixelcord"
}
const storage = createStorage<PISettings>("plugins/pixelcord.platformindicators/settings.json", {
    dflt: { profile: true, elsewhere: false, dms: false, colorMobile: true, bots: false, consoleIcon: "default" }
});

// Set to "profile" while UserProfilePrimaryInfo renders, so the name inside is
// recognized as the profile name (captured at inject time, not render time).
let currentLoc: "profile" | null = null;
const profileWrappers = new WeakMap<Function, Function>();

function tagProfile(ret: any) {
    const Orig = ret?.type;
    if (typeof Orig !== "function") return;
    let W = profileWrappers.get(Orig);
    if (!W) {
        W = function (props: any) {
            const prev = currentLoc;
            currentLoc = "profile";
            try { return Orig(props); } finally { currentLoc = prev; }
        };
        profileWrappers.set(Orig, W);
    }
    ret.type = W;
}

function isBot(userId: string): boolean {
    try { return !!UserStore.getUser(userId)?.bot; } catch { return false; }
}

// Reactive icons for one user — re-renders when their presence changes.
function Indicators({ userId }: { userId: string; }) {
    useObservable([storage]);
    const cs: Record<string, string> = FluxUtils.useStateFromStores(
        [PresenceStore],
        () => PresenceStore.getState()?.clientStatuses?.[userId] ?? {}
    );

    const platforms = Object.entries(cs);
    if (!platforms.length) return null;

    return (
        <>
            {platforms.map(([p, status]) => {
                let ic = PLATFORM_ICONS[p];
                let tint = true;
                if (p === "embedded" && storage.consoleIcon !== "default") {
                    const c = CONSOLE_ICONS[storage.consoleIcon];
                    if (c) { ic = { uri: c.uri, aspect: c.aspect }; tint = c.tint; }
                }
                if (!ic) return null;
                const color = (p === "mobile" && !storage.colorMobile) ? "#23A55A" : statusColor(String(status));
                return (
                    <Image
                        key={p}
                        source={{ uri: ic.uri }}
                        resizeMode="contain"
                        style={{ height: ICON_H, width: ICON_H * ic.aspect, marginLeft: 3, tintColor: tint ? color : undefined }}
                    />
                );
            })}
        </>
    );
}

let unpatchers: Array<() => boolean> = [];

function inject(args: any[], ret: any) {
    try {
        const type = args?.[0];
        const name = type?.displayName || type?.name;

        if (name === "UserProfilePrimaryInfo") { tagProfile(ret); return; }

        const wrap = (userId: string) => {
            if (!userId) return;
            if (!storage.bots && isBot(userId)) return;
            return (
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                    {ret}
                    <Indicators userId={userId} />
                </View>
            );
        };

        // DM list on the home screen: each conversation row is a ChannelRowPreview,
        // whose `channel` is the DM channel — resolve the other user from it.
        if (name === "ChannelRowPreview") {
            if (!storage.dms) return;
            const uid = dmRecipient(args?.[1]?.channel);
            if (!uid) return;
            return wrap(uid);
        }

        // Server member list: each member's sub-label (status line) carries the
        // full user object — reliable per-member anchor.
        if (name === "UserRowSubLabel") {
            if (!storage.elsewhere) return;
            const uid = args?.[1]?.user?.id;
            if (!uid) return;
            return wrap(uid);
        }

        if (name !== "Username" && name !== "DisplayName") return;

        const userId = args?.[1]?.userId ?? args?.[1]?.user?.id;
        if (!userId) return;

        const inProfile = currentLoc === "profile";
        if (inProfile ? !storage.profile : !storage.elsewhere) return;
        return wrap(userId);
    } catch {
        return;
    }
}

const CONSOLE_CHOICES = [
    { key: "default", label: "Padrão (controle)" },
    { key: "vencord", label: "Vencord" },
    { key: "suncord", label: "Suncord" },
    { key: "pixelcord", label: "Pixelcord" }
];

function SettingsComponent() {
    useObservable([storage]);
    return (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingVertical: 16, gap: 16 }}>
            <MText variant="text-md/normal" color="text-muted" style={{ paddingHorizontal: 16 }}>
                Mostra a plataforma (celular/web/desktop/console) do lado do nome. Por padrão só no perfil.
            </MText>
            <TableRowGroup title="Mostrar em">
                <TableSwitchRow label="Perfil" value={storage.profile} onValueChange={(v: boolean) => { storage.profile = v; }} />
                <TableSwitchRow label="Chat e lista de membros" value={storage.elsewhere} onValueChange={(v: boolean) => { storage.elsewhere = v; }} />
                <TableSwitchRow label="Lista de DMs" subLabel="Na tela inicial das conversas." value={storage.dms} onValueChange={(v: boolean) => { storage.dms = v; }} />
            </TableRowGroup>
            <TableRowGroup title="Opções">
                <TableSwitchRow label="Colorir indicador do celular" subLabel="Deixa o ícone de celular na cor do status." value={storage.colorMobile} onValueChange={(v: boolean) => { storage.colorMobile = v; }} />
                <TableSwitchRow label="Mostrar bots" value={storage.bots} onValueChange={(v: boolean) => { storage.bots = v; }} />
            </TableRowGroup>
            <TableRowGroup title="Ícone do console">
                {CONSOLE_CHOICES.map(c => (
                    <TableRow
                        key={c.key}
                        label={c.label}
                        trailing={storage.consoleIcon === c.key ? <MText variant="text-md/semibold" color="text-brand">✓</MText> : undefined}
                        onPress={() => { storage.consoleIcon = c.key; }}
                    />
                ))}
            </TableRowGroup>
        </ScrollView>
    );
}

export const preenabled = false;

export default defineCorePlugin({
    manifest: {
        id: "pixelcord.platformindicators",
        name: "PlatformIndicators",
        version: "1.2.2",
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
