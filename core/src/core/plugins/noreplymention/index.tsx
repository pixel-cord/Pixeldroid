import { after } from "@lib/api/patcher";
import { findByStoreName } from "@metro";

import { defineCorePlugin } from "..";

// Replies don't ping the replied user by default. Opt-in. Patches the stable
// PendingReplyStore so the reply that gets sent has shouldMention = false.

let unpatch: (() => boolean) | undefined;

export const preenabled = false;

export default defineCorePlugin({
    manifest: {
        id: "pixelcord.noreplymention",
        name: "NoReplyMention",
        version: "1.0.0",
        description: "Replies don't ping the user by default",
        authors: [{ name: "myvings", id: "73598582153805824" }]
    },
    start() {
        const PendingReplyStore = findByStoreName("PendingReplyStore");
        if (PendingReplyStore?.getPendingReply) {
            unpatch = after("getPendingReply", PendingReplyStore, (_args: unknown[], reply: any) => {
                if (reply) reply.shouldMention = false;
                return reply;
            });
        }
    },
    stop() {
        unpatch?.();
        unpatch = undefined;
    }
});
