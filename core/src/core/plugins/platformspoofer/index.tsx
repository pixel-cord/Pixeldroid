import { after, instead } from "@lib/api/patcher";
import { createStorage, useObservable } from "@lib/api/storage";
import { findByProps } from "@metro";
import { TableRow, TableRowGroup, Text as MText } from "@metro/common/components";
import { ScrollView } from "react-native";

import { defineCorePlugin } from "..";

// PlatformSpoofer (mobile). Port of Equicord's desktop PlatformSpoofer
// (src/equicordplugins/platformSpoofer) — itself the same idea as
// unconsents/discord-platform-spoofer. Makes your account's gateway IDENTIFY
// report a different platform so the little icon next to your name (mobile /
// desktop / web / console) changes for everyone.
//
// KEY LESSON from the desktop plugin: the platform icon is driven ENTIRELY by
// the `browser` field of the IDENTIFY properties. The desktop patch does
// `{...properties, browser: "Discord Client"}` — it keeps os/device/everything
// else REAL and only overrides `browser`. Spoofing os/device/user-agent too (on
// a real mobile session) just makes Discord ignore or reject the handshake.
//
// Hook (mobile, mined from Vendetta/Revenge spoofers): the IDENTIFY `properties`
// come from `getSuperProperties` (object) and `getSuperPropertiesBase64`
// (the cached base64 the gateway actually sends). We patch both and override
// only `browser`. Opt-in. The icon updates on the next fresh IDENTIFY, so after
// switching you must fully restart Discord (force stop + reopen) — a quick
// reconnect only RESUMEs the session and doesn't re-send properties.

// Maps each platform to the `browser` string that controls the icon —
// verbatim from Equicord's getPlatform().
const PLATFORMS: Record<string, { label: string; sub: string; browser: string }> = {
    desktop: { label: "Desktop", sub: "Discord Client", browser: "Discord Client" },
    web: { label: "Navegador (Web)", sub: "Discord Web", browser: "Discord Web" },
    android: { label: "Android", sub: "Discord Android", browser: "Discord Android" },
    ios: { label: "iOS (iPhone)", sub: "Discord iOS", browser: "Discord iOS" },
    xbox: { label: "Xbox", sub: "Discord Embedded (console)", browser: "Discord Embedded" },
    playstation: { label: "PlayStation", sub: "Discord Embedded (console)", browser: "Discord Embedded" },
    vr: { label: "VR", sub: "Discord VR", browser: "Discord VR" }
};

const PLATFORM_ORDER = ["desktop", "web", "android", "ios", "xbox", "playstation", "vr"];

interface SpooferSettings {
    platform: string;
}
const storage = createStorage<SpooferSettings>("plugins/pixelcord.platformspoofer/settings.json", {
    dflt: { platform: "desktop" }
});

// Override ONLY the browser field — keep every real property (os, device,
// build number, etc.) exactly as Discord built it.
function spoof(real: any): any {
    if (!real) return real;
    const cfg = PLATFORMS[storage.platform] ?? PLATFORMS.desktop;
    return { ...real, browser: cfg.browser };
}

// The gateway sends the cached base64 super-properties; re-encode it with the
// spoofed browser. Decode the real one, override browser, re-encode.
function spoofBase64(realB64: string): string {
    const real = JSON.parse(decodeURIComponent(escape(atob(realB64))));
    const json = JSON.stringify(spoof(real));
    return btoa(unescape(encodeURIComponent(json)));
}

let unpatchers: Array<() => boolean> = [];

export const preenabled = false;

function SettingsComponent() {
    useObservable([storage]);
    return (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingVertical: 16, gap: 16 }}>
            <MText variant="text-md/normal" color="text-muted" style={{ paddingHorizontal: 16 }}>
                Faz a sua conta aparecer em outra plataforma — muda o ícone (celular / computador / web / console)
                que aparece do lado do seu nome para todo mundo. Depois de trocar, feche o Discord por completo
                (force stop) e reabra para aplicar — uma reconexão rápida não basta.
            </MText>
            <MText variant="text-sm/medium" style={{ paddingHorizontal: 16, color: "#f0b232" }}>
                ⚠️ Não dá pra garantir que isso não gere aviso/ban na sua conta. Use por sua conta e risco.
            </MText>
            <TableRowGroup title="Aparecer como">
                {PLATFORM_ORDER.map(key => {
                    const p = PLATFORMS[key];
                    return (
                        <TableRow
                            key={key}
                            label={p.label}
                            subLabel={p.sub}
                            trailing={
                                storage.platform === key ? (
                                    <MText variant="text-md/semibold" color="text-brand">
                                        ✓
                                    </MText>
                                ) : undefined
                            }
                            onPress={() => {
                                storage.platform = key;
                            }}
                        />
                    );
                })}
            </TableRowGroup>
        </ScrollView>
    );
}

export default defineCorePlugin({
    manifest: {
        id: "pixelcord.platformspoofer",
        name: "PlatformSpoofer",
        version: "1.1.0",
        description: "Aparece em outra plataforma (desktop, iOS, Android, Xbox, PlayStation, VR) no lado do seu nome.",
        authors: [{ name: "luvygor", id: "1499140821696647301" }]
    },
    SettingsComponent,
    start() {
        const SuperProps = findByProps("getSuperProperties");
        if (SuperProps?.getSuperProperties) {
            unpatchers.push(after("getSuperProperties", SuperProps, (_args, ret) => spoof(ret)));
        }
        // The base64 form is what the gateway IDENTIFY actually sends (cached, so
        // the object patch above doesn't reach it) — re-encode it with the spoof.
        if (typeof SuperProps?.getSuperPropertiesBase64 === "function") {
            unpatchers.push(
                instead("getSuperPropertiesBase64", SuperProps, (args: any[], orig: any) => {
                    const realB64 = orig(...args);
                    try {
                        return spoofBase64(realB64);
                    } catch {
                        return realB64; // never break the handshake
                    }
                })
            );
        }
    },
    stop() {
        unpatchers.forEach(u => u?.());
        unpatchers = [];
    }
});
