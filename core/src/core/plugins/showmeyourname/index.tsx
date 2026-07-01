import { after, before } from "@lib/api/patcher";
import { createStorage, useObservable } from "@lib/api/storage";
import { findByName, findByProps, findByStoreName } from "@metro";
import { TableRow, TableRowGroup, Text as MText } from "@metro/common/components";
import { ScrollView } from "react-native";

import { defineCorePlugin } from "..";

// ShowMeYourName (mobile). Discord shows a server nickname / display name where
// it can. This forces the real account @username to show too, next to the name.
// Two hooks: (1) chat messages via after("generate", RowManager.prototype) —
// mutate the row's message.username (technique from MrBaskan33's showTag); and
// (2) the profile/account name via a before-jsx patch on the Username component.
// Opt-in (preenabled = false). Default mode shows "Apelido (username)".

const UserStore = findByStoreName("UserStore");
const jsxRuntime = findByProps("jsx", "jsxs");
const RowManager: any = findByName("RowManager");

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

// Fold the username into a single rendered name string (nick + username).
function foldName(shown: string, username: string): string | null {
    if (storage.mode === "username") return "​" + username;
    if (typeof shown !== "string") return null;
    if (shown.toLowerCase().includes(username.toLowerCase())) return null;
    return `${shown} (@${username})`;
}

// Chat messages: RowManager.generate produces the row whose `message.username`
// is the displayed author name. Mutating it changes the name shown in chat.
function patchRow(args: any[], ret: any) {
    try {
        if (storage.mode === "nick") return;
        const row = args?.[0];
        const message = ret?.message;
        if (!message || row?.rowType !== 1 || message.username == null) return;

        const user = row?.message?.author;
        if (!user?.username) return;
        if (user.bot && user.discriminator === "0000") return;

        const nick = row?.message?.nick;
        const base = (nick && nick.toLowerCase() !== user.username.toLowerCase()) ? nick : message.username;
        const next = foldName(base, user.username);
        if (next) message.username = next;

        // Reply preview above the message.
        const reply = message.referencedMessage?.message;
        if (reply?.username != null) {
            const ru = UserStore.getUser(reply.authorId);
            if (ru?.username && !(ru.bot && ru.discriminator === "0000")) {
                const mentions = reply.username.startsWith("@");
                const rnext = foldName(reply.username.replace(/^@/, ""), ru.username);
                if (rnext) reply.username = (mentions ? "@" : "") + rnext;
            }
        }
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
                Mostra o @username real da conta junto do apelido nos nomes do chat e no perfil.
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
        version: "1.1.0",
        description: "Mostra o @username real da conta junto do apelido (no chat e no perfil).",
        authors: [{ name: "myvings", id: "73598582153805824" }]
    },
    SettingsComponent,
    start() {
        // Chat messages.
        if (RowManager?.prototype?.generate) {
            unpatchers.push(after("generate", RowManager.prototype, patchRow));
        }
        // Profile / account-panel name.
        if (jsxRuntime) {
            unpatchers.push(before("jsx", jsxRuntime, inject));
            unpatchers.push(before("jsxs", jsxRuntime, inject));
        }
    },
    stop() {
        unpatchers.forEach(u => u?.());
        unpatchers = [];
    }
});
