import { instead } from "@lib/api/patcher";
import { findByProps, findByStoreName } from "@metro";

import { defineCorePlugin } from "..";

// NoPendingCount (mobile). Removes the red ping count badge for incoming friend
// requests and message requests. The desktop plugin force-returns 0 from
// getPendingCount()/getMessageRequestsCount(); the same store methods exist on
// mobile, so we override them directly. Opt-in (preenabled = false).

const RelationshipStore: any = findByStoreName("RelationshipStore");
const MessageRequestStore: any = findByProps("getMessageRequestsCount");

let unpatchers: Array<() => boolean> = [];

export const preenabled = false;

export default defineCorePlugin({
    manifest: {
        id: "pixelcord.nopendingcount",
        name: "NoPendingCount",
        version: "1.0.0",
        description: "Remove o número de pedidos de amizade e de mensagem pendentes.",
        authors: [{ name: "myvings", id: "73598582153805824" }]
    },
    start() {
        if (typeof RelationshipStore?.getPendingCount === "function") {
            unpatchers.push(instead("getPendingCount", RelationshipStore, () => 0));
        }
        if (typeof MessageRequestStore?.getMessageRequestsCount === "function") {
            unpatchers.push(instead("getMessageRequestsCount", MessageRequestStore, () => 0));
        }
    },
    stop() {
        unpatchers.forEach(u => u?.());
        unpatchers = [];
    }
});
