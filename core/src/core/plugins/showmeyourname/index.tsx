import { before } from "@lib/api/patcher";
import { createStorage, useObservable } from "@lib/api/storage";
import { findByProps, findByStoreName } from "@metro";
import { TableRow, TableRowGroup, Text as MText } from "@metro/common/components";
import { ScrollView } from "react-native";

import { defineCorePlugin } from "..";

// ShowMeYourName (mobile). Discord shows a server nickname / display name where
// it can. This forces the real account @username to show too, next to the
// names rendered in chat and the member list. We patch the Username/DisplayName
// jsx props before render, swapping in the account username from UserStore.
// Opt-in (preenabled = false). Default mode shows "Apelido (username)".

const UserStore = findByStoreName("UserStore");
const jsxRuntime = findByProps("jsx", "jsxs");

interface SMYNSettings {
    mode: string; // "both" | "username" | "nick"
}
const storage = createStorage<SMYNSettings>("plugins/pixelcord.showmeyourname/settings.json", {
    dflt: { mode: "both" }
});

const realUsername = (userId: string): string | null => {
    try {
        const u = UserStore.getUser(userId);
        return u?.username ?? null;
    } catch {
        return null;
    }
};

// Mutate the name prop in place before the component renders.
function tweak(props: any) {
    if (!props || storage.mode === "nick") return;
    const userId = props.userId ?? props.user?.id;
    if (!userId) return;

    const username = realUsername(userId);
    if (!username) return;

    const shown = props.username ?? props.name ?? props.nick;
    if (typeof shown !== "string") {
        // No string to fold into — at least surface the username.
        if ("username" in props) props.username = username;
        return;
    }
    if (shown.includes(username)) return; // already showing it

    const next = storage.mode === "username" ? username : `${shown} (${username})`;
    if ("username" in props) props.username = next;
    else if ("name" in props) props.name = next;
    else if ("nick" in props) props.nick = next;
}

let unpatchers: Array<() => boolean> = [];

function inject(args: any[]) {
    try {
        const type = args?.[0];
        const name = type?.displayName || type?.name;
        if (name === "Username" || name === "DisplayName") tweak(args?.[1]);
    } catch { /* ignore */ }
}

const MODES = [
    { key: "both", label: "Apelido e @username", sub: "Ex: Ygor (luvygor)" },
    { key: "username", label: "Só @username", sub: "Sempre mostra o nome real da conta." },
    { key: "nick", label: "Padrão do Discord", sub: "Não muda nada (desliga o efeito)." }
];

function SettingsComponent() {
    useObservable([storage]);
    return (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingVertical: 16, gap: 16 }}>
            <MText variant="text-md/normal" color="text-muted" style={{ paddingHorizontal: 16 }}>
                Mostra o @username real da conta junto do apelido no perfil da pessoa.
            </MText>
            <TableRowGroup title="Como mostrar">
                {MODES.map(m => (
                    <TableRow
                        key={m.key}
                        label={m.label}
                        subLabel={m.sub}
                        trailing={storage.mode === m.key ? <MText variant="text-md/semibold" color="text-brand">✓</MText> : undefined}
                        onPress={() => { storage.mode = m.key; }}
                    />
                ))}
            </TableRowGroup>
        </ScrollView>
    );
}

export const preenabled = false;

export default defineCorePlugin({
    manifest: {
        id: "pixelcord.showmeyourname",
        name: "ShowMeYourName",
        version: "1.0.0",
        description: "Mostra o @username real da conta junto do apelido no perfil.",
        authors: [{ name: "luvygor", id: "1499140821696647301" }]
    },
    SettingsComponent,
    start() {
        if (!jsxRuntime) return;
        unpatchers.push(before("jsx", jsxRuntime, inject));
        unpatchers.push(before("jsxs", jsxRuntime, inject));
    },
    stop() {
        unpatchers.forEach(u => u?.());
        unpatchers = [];
    }
});
