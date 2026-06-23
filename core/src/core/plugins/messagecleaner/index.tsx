import { findAssetId } from "@lib/api/assets";
import { registerCommand } from "@lib/api/commands";
import { after } from "@lib/api/patcher";
import { showSheet } from "@lib/ui/sheets";
import { findByName, findByStoreName } from "@metro";
import { messageUtil } from "@metro/common";
import { Text } from "@metro/common/components";
import { Image, Pressable, View } from "react-native";

import { defineCorePlugin } from "..";
import CleanerPanel, { CLEANER_SHEET_KEY } from "./CleanerPanel";
import { TRASH_ICON_PNG } from "./icon";

// Port of the desktop MessageCleaner: bulk-delete your own messages in the
// current channel. Triggered by `/clean` OR a small "🧹 Limpar" button injected
// into the chat input's context bar (ChatInputContextBar — the proven mobile
// injection point, used by ReactionBar: after("default", …) then unshift into
// children). Both open the same bottom-sheet panel.
//
// ⚠️ Bulk self-deletion technically violates Discord's ToS — opt-in, use at your
// own risk.

const ChatInputContextBar: any = findByName("ChatInputContextBar", false);
const SelectedChannelStore: any = findByStoreName("SelectedChannelStore");
const ChannelStore: any = findByStoreName("ChannelStore");
// Native Discord icon (vector, themeable) — never an emoji.
const TRASH_ICON = findAssetId("TrashIcon") ?? findAssetId("ic_trash") ?? findAssetId("trash");

function openCleaner(channelId: string) {
    const ch = ChannelStore?.getChannel?.(channelId);
    showSheet(CLEANER_SHEET_KEY, CleanerPanel, {
        channelId,
        channelName: ch?.name || "Mensagem Direta"
    });
}

// Small right-aligned button shown above the chat input.
function CleanerButton() {
    const channelId = SelectedChannelStore?.getChannelId?.();
    if (!channelId) return null;
    return (
        <View style={{ width: "100%", alignItems: "flex-end", paddingHorizontal: 12, paddingTop: 4 }}>
            <Pressable
                onPress={() => openCleaner(channelId)}
                style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    backgroundColor: "rgba(127,127,127,0.18)",
                    borderRadius: 14,
                    paddingVertical: 5,
                    paddingHorizontal: 12
                }}
            >
                <Image
                    source={TRASH_ICON ?? { uri: TRASH_ICON_PNG }}
                    resizeMode="contain"
                    style={{ width: 15, height: 15, tintColor: "#dbdee1" }}
                />
                <Text variant="text-sm/semibold" style={{ color: "#dbdee1" }}>Limpar</Text>
            </Pressable>
        </View>
    );
}

export const preenabled = false;

let unregister: (() => void) | undefined;
let unpatchBar: (() => boolean) | undefined;

export default defineCorePlugin({
    manifest: {
        id: "pixelcord.messagecleaner",
        name: "MessageCleaner",
        version: "1.2.0",
        description: "Apaga suas próprias mensagens em massa no chat atual. Use /clean ou o botão Limpar acima do campo de texto. Viola o ToS do Discord — use por sua conta e risco.",
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
                openCleaner(channel.id);
            }
        });

        // Chat-bar button.
        if (ChatInputContextBar) {
            unpatchBar = after("default", ChatInputContextBar, (_args: unknown[], ret: any) => {
                try {
                    const btn = <CleanerButton key="pc-cleaner-btn" />;
                    if (ret?.props) {
                        const kids = ret.props.children;
                        if (Array.isArray(kids)) kids.unshift(btn);
                        else ret.props.children = [btn, kids];
                        return;
                    }
                    // The context bar renders nothing when there's no reply/edit
                    // context — return our own thin bar so the button is always shown.
                    return <View>{btn}</View>;
                } catch { /* ignore */ }
            });
        }
    },
    stop() {
        unregister?.();
        unregister = undefined;
        unpatchBar?.();
        unpatchBar = undefined;
    }
});
