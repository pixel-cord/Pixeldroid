import { registerCommand } from "@lib/api/commands";
import { ApplicationCommandOptionType } from "@lib/api/commands/types";
import { after } from "@lib/api/patcher";
import { showToast } from "@lib/ui/toasts";
import { findByProps, findByStoreName } from "@metro";
import { messageUtil } from "@metro/common";
import { createElement, useEffect, useState } from "react";
import { Pressable, Text } from "react-native";

import { defineCorePlugin } from "..";

// Port of the desktop FakeMute. While ON, your mic keeps transmitting and remote
// audio keeps playing even though Discord's own mute/deafen buttons report you as
// muted/deafened to everyone. Driven by the *normal* mute & deafen buttons — this
// only suppresses the local media gating.
//
// On mobile we add a round toggle button right next to the mic button in the
// voice panel (VoicePanelController renders VoicePanelRiveMicButton — found via
// on-device introspection). The `/fakemute` command stays as a backup toggle.

// Opt-in: most people don't want a fake mute armed by default.
export const preenabled = false;

const MediaEngineStore = findByStoreName("MediaEngineStore");

let fakeMode = false;

// Tiny pub/sub so the panel button re-renders the moment we toggle.
const subscribers = new Set<() => void>();
const notify = () => subscribers.forEach(fn => fn());

// --- connection prototype hook -------------------------------------------
// Discord pushes self-mute / self-deafen to WebRTC via
// MediaEngineConnection.setSelfMute / setSelfDeaf. We wrap those on the
// *prototype* so that, while fakeMode is on, the connection is always told
// "not muted / not deafened". Patching the prototype keeps the hook alive
// across channel switches and reconnects.
const HOOKED = Symbol.for("pixelcord.fakeMute.hooked");
const ORIG_MUTE = Symbol.for("pixelcord.fakeMute.origSetSelfMute");
const ORIG_DEAF = Symbol.for("pixelcord.fakeMute.origSetSelfDeaf");
let hookedProto: any = null;
let origSetSelfMute: ((this: any, mute: boolean) => void) | null = null;
let origSetSelfDeaf: ((this: any, deaf: boolean) => void) | null = null;

function getConnections(): any[] {
    const engine = MediaEngineStore?.getMediaEngine?.();
    const set = engine?.connections;
    return set ? [...set] : [];
}

function ensureHooked() {
    if (hookedProto) return;
    const conn = getConnections()[0];
    if (!conn) return;

    const proto = Object.getPrototypeOf(conn);
    if (proto[HOOKED]) {
        origSetSelfMute = proto[ORIG_MUTE] ?? null;
        origSetSelfDeaf = proto[ORIG_DEAF] ?? null;
        hookedProto = proto;
        return;
    }

    origSetSelfMute = proto.setSelfMute;
    origSetSelfDeaf = proto.setSelfDeaf;
    proto[ORIG_MUTE] = origSetSelfMute;
    proto[ORIG_DEAF] = origSetSelfDeaf;

    proto.setSelfMute = function (mute: boolean) {
        return origSetSelfMute!.call(this, fakeMode ? false : mute);
    };
    proto.setSelfDeaf = function (deaf: boolean) {
        return origSetSelfDeaf!.call(this, fakeMode ? false : deaf);
    };

    proto[HOOKED] = true;
    hookedProto = proto;
}

function unhook() {
    if (!hookedProto) return;
    const origMute = origSetSelfMute ?? hookedProto[ORIG_MUTE];
    const origDeaf = origSetSelfDeaf ?? hookedProto[ORIG_DEAF];
    if (origMute) hookedProto.setSelfMute = origMute;
    if (origDeaf) hookedProto.setSelfDeaf = origDeaf;
    delete hookedProto[HOOKED];
    delete hookedProto[ORIG_MUTE];
    delete hookedProto[ORIG_DEAF];
    hookedProto = null;
    origSetSelfMute = origSetSelfDeaf = null;
}

function reconcile() {
    for (const conn of getConnections()) {
        origSetSelfMute?.call(conn, fakeMode ? false : MediaEngineStore.isSelfMute());
        origSetSelfDeaf?.call(conn, fakeMode ? false : MediaEngineStore.isSelfDeaf());
    }
}

function setFakeMode(on: boolean) {
    fakeMode = on;
    ensureHooked();
    reconcile();
    notify();
    showToast(on
        ? "🫥 Fake mode: ON — mute/deafen mentem pra todo mundo."
        : "🎙️ Fake mode: OFF");
}

function onMediaChange() {
    if (!fakeMode) return;
    ensureHooked();
    reconcile();
}

// --- the button rendered next to the mic ---------------------------------
function FakeMuteButton() {
    const [on, setOn] = useState(fakeMode);
    useEffect(() => {
        const fn = () => setOn(fakeMode);
        subscribers.add(fn);
        return () => void subscribers.delete(fn);
    }, []);

    return (
        <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: on }}
            accessibilityLabel="Fake mute"
            onPress={() => setFakeMode(!fakeMode)}
            style={{
                width: 48,
                height: 48,
                borderRadius: 24,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: on ? "#f23f43" : "rgba(120,120,128,0.32)"
            }}
        >
            <Text style={{ fontSize: 20 }}>{on ? "🤫" : "🥸"}</Text>
        </Pressable>
    );
}

// The mic button (VoicePanelRiveMicButton) is created deep inside a child of the
// voice panel, so patching one container's render tree misses it. Instead we hook
// the JSX runtime: whenever *anything* creates the mic element, we replace it with
// a row holding [mic, our toggle]. Works no matter which component renders it.
// createElement (not JSX) builds the wrapper so we don't re-enter the patched jsx.
function isMic(el: any): boolean {
    const t = el?.type;
    return !!t && (t.name === "VoicePanelRiveMicButton" || t.displayName === "VoicePanelRiveMicButton");
}

// The mic isn't a direct array sibling — it's nested inside its own wrapper in
// the control-bar row. So we look for the row's children ARRAY where ONE item has
// the mic somewhere in its subtree (within a few levels), and splice our button
// right after that item — giving it a real, evenly-spaced slot like the others.
function micInSubtree(node: any, depth: number): boolean {
    if (!node || depth > 3) return false;
    if (Array.isArray(node)) return node.some((c: any) => micInSubtree(c, depth));
    if (typeof node !== "object") return false;
    if (isMic(node)) return true;
    return micInSubtree(node.props?.children, depth + 1);
}

function wrapMic(_args: unknown[], ret: any) {
    try {
        const ch = ret?.props?.children;
        if (Array.isArray(ch) && ch.length >= 3 && ch.length <= 8 && !ch.some((c: any) => c?.key === "px-fakemute")) {
            const i = ch.findIndex((c: any) => micInSubtree(c, 0));
            if (i !== -1) ch.splice(i + 1, 0, createElement(FakeMuteButton, { key: "px-fakemute" }));
        }
    } catch { /* never break the voice panel */ }
}

let unpatchers: Array<() => boolean> = [];
let unregister: (() => void) | undefined;

export default defineCorePlugin({
    manifest: {
        id: "pixelcord.fakemute",
        name: "FakeMute",
        version: "1.0.0",
        description: "Adds a toggle next to the mic in the voice panel (also /fakemute): turn it on, then use Discord's normal mute & deafen — others see you muted/deafened while your mic keeps transmitting and you keep hearing.",
        authors: [{ name: "myvings", id: "73598582153805824" }]
    },
    start() {
        MediaEngineStore?.addChangeListener?.(onMediaChange);

        // Inject the toggle next to the mic button by wrapping it on the JSX runtime.
        const jsxRuntime = findByProps("jsx", "jsxs");
        if (jsxRuntime) {
            unpatchers.push(after("jsx", jsxRuntime, wrapMic));
            unpatchers.push(after("jsxs", jsxRuntime, wrapMic));
        }

        // Backup toggle via slash command.
        unregister = registerCommand({
            name: "fakemute",
            description: "Liga/desliga o fake mute/deafen (use os botões normais depois).",
            shouldHide: () => true,
            options: [
                {
                    name: "state",
                    description: "on / off (vazio = alterna)",
                    type: ApplicationCommandOptionType.BOOLEAN
                }
            ],
            execute(args, ctx) {
                const arg = args.find(a => a.name === "state");
                const next = arg ? Boolean(arg.value) : !fakeMode;
                setFakeMode(next);
                messageUtil.sendBotMessage(
                    ctx.channel.id,
                    next
                        ? "🫥 **Fake mute ON** — seus botões de mute/deafen agora mentem. Use-os normalmente."
                        : "🎙️ **Fake mute OFF** — mute/deafen voltaram ao normal."
                );
            }
        });
    },
    stop() {
        MediaEngineStore?.removeChangeListener?.(onMediaChange);
        unpatchers.forEach(u => u?.());
        unpatchers = [];
        fakeMode = false;
        reconcile();
        unhook();
        notify();
        unregister?.();
        unregister = undefined;
    }
});
