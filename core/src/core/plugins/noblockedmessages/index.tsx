import { before } from "@lib/api/patcher";
import { createStorage, useObservable } from "@lib/api/storage";
import { findByProps, findByStoreName } from "@metro";
import { TableRowGroup, TableSwitchRow, Text } from "@metro/common/components";
import { ScrollView } from "react-native";

import { defineCorePlugin } from "..";

// NoBlockedMessages (mobile, attempt #2). Instead of blanking each message row
// (which left empty artifacts), we filter the row list before it renders: the
// chat list's `updateRows(rows)` receives the array of row descriptors, so we
// drop blocked/ignored users' messages (rowType 1) AND Discord's collapsed
// "X blocked messages" bar (rowType 2, identified by its author). Clean removal,
// no gaps, no crash.

const RelationshipStore = findByStoreName("RelationshipStore");
// The messages list ref class (scrollTo / updateRows / clearRows / fadeIn …).
const MessagesList = findByProps("updateRows", "clearRows");

interface NBMSettings {
    ignored: boolean;
}
const storage = createStorage<NBMSettings>("plugins/pixelcord.noblockedmessages/settings.json", {
    dflt: { ignored: true }
});

function isSuppressed(authorId?: string): boolean {
    if (!authorId) return false;
    try {
        if (RelationshipStore?.isBlocked?.(authorId)) return true;
        if (storage.ignored && RelationshipStore?.isIgnored?.(authorId)) return true;
    } catch { /* noop */ }
    return false;
}

// rowType 1 = message, rowType 2 = collapsed "X blocked messages" bar. Both carry
// the (representative) message whose author tells us if it's blocked/ignored.
function shouldHideRow(r: any): boolean {
    if (!r || (r.rowType !== 1 && r.rowType !== 2)) return false;
    const aid = r.message?.author?.id ?? r.message?.authorId;
    return isSuppressed(aid);
}

let unpatch: (() => boolean) | null = null;

function SettingsComponent() {
    useObservable([storage]);
    return (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingVertical: 16, gap: 16 }}>
            <Text variant="text-md/normal" color="text-muted" style={{ paddingHorizontal: 16 }}>
                Remove do chat as mensagens de quem você bloqueou — incluindo a barra "X mensagens
                bloqueadas". Opcionalmente também esconde usuários ignorados.
            </Text>
            <TableRowGroup title="Opções">
                <TableSwitchRow
                    label="Esconder ignorados também"
                    subLabel="Além dos bloqueados, esconde mensagens de usuários ignorados."
                    value={storage.ignored}
                    onValueChange={(v: boolean) => { storage.ignored = v; }}
                />
            </TableRowGroup>
        </ScrollView>
    );
}

export const preenabled = false;

export default defineCorePlugin({
    manifest: {
        id: "pixelcord.noblockedmessages",
        name: "NoBlockedMessages",
        version: "1.1.0",
        description: "Remove do chat as mensagens de usuários bloqueados (e opcionalmente ignorados), incluindo a barra \"X mensagens bloqueadas\".",
        authors: [{ name: "luvygor", id: "1499140821696647301" }]
    },
    SettingsComponent,
    start() {
        if (!MessagesList?.updateRows) return;
        unpatch = before("updateRows", MessagesList, (args: any[]) => {
            try {
                const rows = args?.[0];
                if (!Array.isArray(rows)) return;
                const filtered = rows.filter(r => !shouldHideRow(r));
                if (filtered.length !== rows.length) args[0] = filtered;
            } catch { /* never break the chat over a hide */ }
        });
    },
    stop() {
        unpatch?.();
        unpatch = null;
    }
});
