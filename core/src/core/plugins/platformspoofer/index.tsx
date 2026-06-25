import { after, instead } from "@lib/api/patcher";
import { createStorage, useObservable } from "@lib/api/storage";
import { findByProps } from "@metro";
import { TableRow, TableRowGroup, Text as MText } from "@metro/common/components";
import { ScrollView } from "react-native";

import { defineCorePlugin } from "..";

// PlatformSpoofer (mobile). Port of unconsents/discord-platform-spoofer (spoof.py).
// Makes your account's gateway IDENTIFY report a different platform, so the little
// platform icon next to your name (mobile / desktop / web / console) changes for
// everyone who sees you.
//
// Hook point (mined from Vendetta/Revenge spoofer plugins): the gateway IDENTIFY
// `properties` object — the one holding os/browser/device — is produced by
// `getSuperProperties`. We patch it with an `after` to merge our spoofed fields
// over the real ones, KEEPING the real `client_build_number` (spoofing the build
// number can cause the gateway to reject the session). A second `instead` on the
// identify dispatcher (_doIdentify / sendIdentify) is belt-and-suspenders in case
// the gateway snapshots properties elsewhere.
//
// Opt-in (preenabled = false). The icon updates on the next gateway IDENTIFY, so
// after switching platforms you must reconnect (close & reopen Discord, or toggle
// airplane mode) for the new platform to show.

// Faithful port of spoof.py's PLATFORM_CONFIGS.
interface PlatformProps {
    os: string;
    browser: string;
    device: string;
    system_locale: string;
    browser_user_agent: string;
    browser_version: string;
    os_version: string;
    release_channel?: string;
    client_event_source?: null;
}

const PLATFORMS: Record<string, { label: string; sub: string; props: PlatformProps }> = {
    desktop: {
        label: "Desktop",
        sub: "Windows · Discord Client",
        props: {
            os: "Windows",
            browser: "Discord Client",
            device: "",
            system_locale: "en-US",
            browser_user_agent:
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) discord/1.0.9171 Chrome/124.0.6367.243 Electron/30.4.0 Safari/537.36",
            browser_version: "30.4.0",
            os_version: "10.0.22631",
            release_channel: "stable",
            client_event_source: null
        }
    },
    web: {
        label: "Navegador (Web)",
        sub: "Windows · Discord Web",
        props: {
            os: "Windows",
            browser: "Discord Web",
            device: "",
            system_locale: "en-US",
            browser_user_agent:
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            browser_version: "124.0.0.0",
            os_version: "10",
            release_channel: "stable",
            client_event_source: null
        }
    },
    ios: {
        label: "iOS (iPhone)",
        sub: "iPhone16,2 · Discord iOS",
        props: {
            os: "iOS",
            browser: "Discord iOS",
            device: "iPhone16,2",
            system_locale: "en-US",
            browser_user_agent: "Discord/268.0 CFNetwork/1474 Darwin/23.0.0",
            browser_version: "268.0",
            os_version: "17.4.1",
            client_event_source: null
        }
    },
    android: {
        label: "Android",
        sub: "Pixel 8 · Discord Android",
        props: {
            os: "Android",
            browser: "Discord Android",
            device: "Pixel 8",
            system_locale: "en-US",
            browser_user_agent: "Discord-Android/214116;ROM:13;Device:Pixel 8",
            browser_version: "214.116",
            os_version: "13",
            client_event_source: null
        }
    },
    xbox: {
        label: "Xbox",
        sub: "Xbox Series X · Discord Embedded",
        props: {
            os: "Console",
            browser: "Discord Embedded",
            device: "Xbox Series X",
            system_locale: "en-US",
            browser_user_agent:
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64; Xbox; Xbox Series X) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edge/124.0.0.0",
            browser_version: "",
            os_version: "",
            client_event_source: null
        }
    },
    playstation: {
        label: "PlayStation",
        sub: "PlayStation 5 · Discord Embedded",
        props: {
            os: "Console",
            browser: "Discord Embedded",
            device: "PlayStation 5",
            system_locale: "en-US",
            browser_user_agent: "Mozilla/5.0 (PlayStation 5 3.11) AppleWebKit/605.1.15 (KHTML, like Gecko)",
            browser_version: "",
            os_version: "",
            client_event_source: null
        }
    },
    vr: {
        label: "VR",
        sub: "VR-Headset · Discord VR",
        props: {
            os: "Console",
            browser: "Discord VR",
            device: "VR-Headset",
            system_locale: "en-US",
            browser_user_agent: "DiscordVR/12.45",
            browser_version: "23.7.91",
            os_version: "10.0.45",
            client_event_source: null
        }
    }
};

interface SpooferSettings {
    platform: string;
}
const storage = createStorage<SpooferSettings>("plugins/pixelcord.platformspoofer/settings.json", {
    dflt: { platform: "desktop" }
});

// Merge spoofed fields over the real properties, keeping the real client_build_number.
function spoof(real: any): any {
    if (!real) return real;
    const cfg = PLATFORMS[storage.platform] ?? PLATFORMS.desktop;
    return {
        ...real,
        ...cfg.props,
        client_build_number: real.client_build_number
    };
}

// The gateway IDENTIFY uses the base64 string (cached separately from the
// getSuperProperties object), so we must re-encode it too. Decode the real
// base64, spoof its fields, re-encode — keeps every real field (build number,
// launch id, etc.) and only overrides the platform ones.
function spoofBase64(realB64: string): string {
    const real = JSON.parse(decodeURIComponent(escape(atob(realB64))));
    const json = JSON.stringify(spoof(real));
    return btoa(unescape(encodeURIComponent(json)));
}

let unpatchers: Array<() => boolean> = [];

export const preenabled = false;

const PLATFORM_ORDER = ["desktop", "web", "android", "ios", "xbox", "playstation", "vr"];

function SettingsComponent() {
    useObservable([storage]);
    return (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingVertical: 16, gap: 16 }}>
            <MText variant="text-md/normal" color="text-muted" style={{ paddingHorizontal: 16 }}>
                Faz a sua conta aparecer em outra plataforma — muda o ícone (celular / computador / web / console)
                que aparece do lado do seu nome para todo mundo. Depois de trocar, reconecte (feche e abra o
                Discord, ou ative/desative o modo avião) para aplicar.
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
        version: "1.0.1",
        description: "Aparece em outra plataforma (desktop, iOS, Android, Xbox, PlayStation, VR) no lado do seu nome.",
        authors: [{ name: "luvygor", id: "1499140821696647301" }]
    },
    SettingsComponent,
    start() {
        // Primary: the module that builds the IDENTIFY `properties` / X-Super-Properties.
        const SuperProps = findByProps("getSuperProperties");
        if (SuperProps?.getSuperProperties) {
            unpatchers.push(after("getSuperProperties", SuperProps, (_args, ret) => spoof(ret)));
        }
        // The base64 form is what the gateway IDENTIFY actually sends (and it's
        // cached, so the object patch above doesn't reach it) — re-encode it.
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

        // Fallback: mutate the IDENTIFY payload at dispatch time, in case the gateway
        // snapshots properties separately from getSuperProperties.
        const session =
            findByProps("_doIdentify") ||
            findByProps("sendIdentify") ||
            findByProps("identify", "reconnect");
        if (session) {
            const key =
                Object.keys(session).find(
                    k => typeof session[k] === "function" && session[k].toString().includes("IDENTIFY")
                ) ?? (typeof session._doIdentify === "function" ? "_doIdentify" : undefined);
            if (key && typeof session[key] === "function") {
                unpatchers.push(
                    instead(key, session, (args: any[], orig: any) => {
                        try {
                            if (args?.[0]?.properties) {
                                args[0].properties = spoof(args[0].properties);
                            }
                        } catch {
                            /* ignore — never break identify */
                        }
                        return orig(...args);
                    })
                );
            }
        }
    },
    stop() {
        unpatchers.forEach(u => u?.());
        unpatchers = [];
    }
});
