import { before } from "@lib/api/patcher";
import { createStorage, useObservable } from "@lib/api/storage";
import { findByName, findByStoreName } from "@metro";
import { TableRowGroup, TableSwitchRow, Text } from "@metro/common/components";
import { ScrollView } from "react-native";

import { defineCorePlugin } from "..";

// NoBlockedMessages (mobile, attempt #1). Hides messages from blocked (and
// optionally ignored) users by emptying their row in RowManager.generate — the
// per-message factory the chat list calls (rowType 1 = a message row; author at
// message.author.id). If this leaves a visible gap, the next iteration switches
// to filtering the row list instead.

const RowManager = findByName("RowManager");
const RelationshipStore = findByStoreName("RelationshipStore");

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

let unpatch: (() => boolean) | null = null;

function SettingsComponent() {
    useObservable([storage]);
    return (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingVertical: 16, gap: 16 }}>
            <Text variant="text-md/normal" color="text-muted" style={{ paddingHorizontal: 16 }}>
                Esconde as mensagens de quem você bloqueou. Opcionalmente também as de usuários ignorados.
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
        version: "1.0.0",
        description: "Esconde as mensagens de usuários bloqueados (e opcionalmente ignorados) do chat.",
        authors: [{ name: "luvygor", id: "1499140821696647301" }]
    },
    SettingsComponent,
    start() {
        const proto = RowManager?.prototype;
        if (!proto?.generate) return;
        unpatch = before("generate", proto, (args: any[]) => {
            try {
                const data = args?.[0];
                if (!data || data.rowType !== 1) return;
                const m = data.message;
                const aid = m?.author?.id ?? m?.authorId;
                if (!isSuppressed(aid)) return;

                // Collapse the blocked message to nothing.
                data.renderContentOnly = true;
                data.isFirst = false;
                data.separatorBefore = false;
                data.message = {
                    ...m,
                    content: "",
                    attachments: [],
                    embeds: [],
                    stickerItems: [],
                    stickers: [],
                    soundboardSounds: [],
                    components: [],
                    codedLinks: [],
                    customRenderedContent: null
                };
            } catch { /* never break the chat over a hide */ }
        });
    },
    stop() {
        unpatch?.();
        unpatch = null;
    }
});
