import { instead } from "@lib/api/patcher";
import { findByProps } from "@metro";

import { defineCorePlugin } from "..";

// NoUnblockToJump (mobile). Discord asks you to unblock a user before letting
// you jump to one of their messages (search/reply jump). The gate is
// isBlockedForMessage(); forcing it false lets the jump happen without the
// unblock prompt. Note: a side effect is that blocked authors' messages may
// also render instead of being collapsed. Opt-in (preenabled = false).

const Blocked: any = findByProps("isBlockedForMessage");

let unpatch: (() => boolean) | undefined;

export const preenabled = false;

export default defineCorePlugin({
    manifest: {
        id: "pixelcord.nounblocktojump",
        name: "NoUnblockToJump",
        version: "1.0.0",
        description: "Permite pular para mensagens de usuários bloqueados sem precisar desbloquear.",
        authors: [{ name: "myvings", id: "73598582153805824" }]
    },
    start() {
        if (typeof Blocked?.isBlockedForMessage === "function") {
            unpatch = instead("isBlockedForMessage", Blocked, () => false);
        }
    },
    stop() {
        unpatch?.();
        unpatch = undefined;
    }
});
