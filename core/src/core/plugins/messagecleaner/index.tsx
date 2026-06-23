import { registerCommand } from "@lib/api/commands";
import { showSheet } from "@lib/ui/sheets";
import { messageUtil } from "@metro/common";

import { defineCorePlugin } from "..";
import CleanerPanel, { CLEANER_SHEET_KEY } from "./CleanerPanel";

// Port of the desktop MessageCleaner: bulk-delete your own messages in the
// current channel. Trigger is `/clean`, which opens a clean bottom-sheet panel
// (type filters, "contains", limit, speed, live progress) — a tidier take on the
// desktop modal. A chat-bar button can be added later via UI injection.
//
// ⚠️ Bulk self-deletion technically violates Discord's ToS — opt-in, use at your
// own risk.
export const preenabled = false;

let unregister: (() => void) | undefined;

export default defineCorePlugin({
    manifest: {
        id: "pixelcord.messagecleaner",
        name: "MessageCleaner",
        version: "1.1.1",
        description: "Apaga suas próprias mensagens em massa no chat atual. Use /clean para abrir o painel (filtros por tipo, texto, limite e velocidade). Viola o ToS do Discord — use por sua conta e risco.",
        authors: [{ name: "luvygor", id: "1499140821696647301" }]
    },
    start() {
        unregister = registerCommand({
            name: "clean",
            description: "Abre o painel pra apagar suas mensagens neste chat (ToS risk).",
            shouldHide: () => true,
            options: [],
            execute(_args, ctx) {
                const channel = ctx.channel;
                if (!channel?.id) {
                    messageUtil.sendBotMessage(ctx.channel.id, "Não consegui identificar este chat.");
                    return;
                }
                showSheet(CLEANER_SHEET_KEY, CleanerPanel, {
                    channelId: channel.id,
                    channelName: channel.name || "Mensagem Direta"
                });
            }
        });
    },
    stop() {
        unregister?.();
        unregister = undefined;
    }
});
