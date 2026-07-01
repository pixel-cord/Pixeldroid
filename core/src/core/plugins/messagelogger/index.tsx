import { intercept } from "@lib/api/flux";
import { createStorage, useObservable } from "@lib/api/storage";
import { findByStoreName } from "@metro";
import { TableRowGroup, TableSwitchRow, Text as MText } from "@metro/common/components";
import { ScrollView } from "react-native";

import { defineCorePlugin } from "..";

// MessageLogger (mobile). Keeps deleted messages visible instead of letting them
// vanish. Uses the Flux interceptor: when a MESSAGE_DELETE would fire, we rewrite
// it into a MESSAGE_UPDATE that keeps the message in the store, flagged `deleted`
// and prefixed with a 🗑️ marker so it's clearly a deleted message. Opt-in.
// (Edit-history / red styling need on-device render introspection — future work.)

const MessageStore = findByStoreName("MessageStore");
const UserStore = findByStoreName("UserStore");

const DELETED_MARK = "🗑️";

interface MLSettings {
    ignoreBots: boolean;
    ignoreSelf: boolean;
}
const storage = createStorage<MLSettings>("plugins/pixelcord.messagelogger/settings.json", {
    dflt: { ignoreBots: false, ignoreSelf: false }
});

let unintercept: (() => void) | undefined;

function shouldKeep(msg: any): boolean {
    if (!msg) return false;
    if (storage.ignoreBots && msg.author?.bot) return false;
    if (storage.ignoreSelf && msg.author?.id === UserStore?.getCurrentUser?.()?.id) return false;
    return true;
}

function SettingsComponent() {
    useObservable([storage]);
    return (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingVertical: 16, gap: 16 }}>
            <MText variant="text-md/normal" color="text-muted" style={{ paddingHorizontal: 16 }}>
                Mantém mensagens apagadas visíveis no chat (marcadas com {DELETED_MARK}) em vez de sumirem.
            </MText>
            <TableRowGroup title="Ignorar">
                <TableSwitchRow
                    label="Ignorar bots"
                    subLabel="Não guardar mensagens apagadas de bots."
                    value={storage.ignoreBots}
                    onValueChange={(v: boolean) => { storage.ignoreBots = v; }}
                />
                <TableSwitchRow
                    label="Ignorar minhas mensagens"
                    subLabel="Não guardar suas próprias mensagens apagadas."
                    value={storage.ignoreSelf}
                    onValueChange={(v: boolean) => { storage.ignoreSelf = v; }}
                />
            </TableRowGroup>
        </ScrollView>
    );
}

export const preenabled = false;

export default defineCorePlugin({
    manifest: {
        id: "pixelcord.messagelogger",
        name: "MessageLogger",
        version: "1.0.0",
        description: "Mantém mensagens apagadas visíveis no chat (marcadas), em vez de sumirem.",
        authors: [{ name: "myvings", id: "73598582153805824" }]
    },
    SettingsComponent,
    start() {
        unintercept = intercept((payload: any) => {
            if (payload.type !== "MESSAGE_DELETE") return;

            const msg = MessageStore?.getMessage?.(payload.channelId, payload.id);
            if (!shouldKeep(msg)) return; // let Discord delete it normally

            // Rewrite the delete into an update that keeps the message.
            const content = typeof msg.content === "string" ? msg.content : "";
            return {
                type: "MESSAGE_UPDATE",
                message: {
                    ...msg,
                    deleted: true,
                    content: content ? `${DELETED_MARK} ${content}` : DELETED_MARK
                }
            };
        });
    },
    stop() {
        unintercept?.();
    }
});
