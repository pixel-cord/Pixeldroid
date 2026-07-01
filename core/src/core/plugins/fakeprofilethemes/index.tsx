import { after } from "@lib/api/patcher";
import { createStorage, useObservable } from "@lib/api/storage";
import { findByStoreName } from "@metro";
import { TableRowGroup, TableSwitchRow, Text } from "@metro/common/components";
import { ScrollView } from "react-native";

import { defineCorePlugin } from "..";

// FakeProfileThemes (mobile, display side). Other people encode two profile
// colors into their bio with invisible "3y3" characters (the desktop plugin's
// scheme). We decode them and apply them as themeColors, so a profile someone
// colored on desktop shows colored here too. Same decode as desktop = compatible.

const UserProfileStore = findByStoreName("UserProfileStore");

interface FPTSettings {
    nitroFirst: boolean;
}
const storage = createStorage<FPTSettings>("plugins/pixelcord.fakeprofilethemes/settings.json", {
    dflt: { nitroFirst: true }
});

// Courtesy of Cynthia — identical to the desktop plugin so bios stay compatible.
function decode(bio: string | null | undefined): number[] | null {
    if (bio == null) return null;
    const match = bio.match(
        /\u{e005b}\u{e0023}([\u{e0061}-\u{e0066}\u{e0041}-\u{e0046}\u{e0030}-\u{e0039}]{1,6})\u{e002c}\u{e0023}([\u{e0061}-\u{e0066}\u{e0041}-\u{e0046}\u{e0030}-\u{e0039}]{1,6})\u{e005d}/u
    );
    if (!match) return null;
    const parsed = [...match[0]].map(x => String.fromCodePoint(x.codePointAt(0)! - 0xe0000)).join("");
    return parsed
        .substring(1, parsed.length - 1)
        .split(",")
        .map(x => parseInt(x.replace("#", "0x"), 16));
}

const cache = new WeakMap<any, any>();

function apply(profile: any): any {
    if (!profile?.bio) return profile;
    // Respect a real Nitro theme when present, if the user prefers that.
    if (storage.nitroFirst && profile.themeColors) return profile;

    const colors = decode(profile.bio);
    if (!colors || colors.length < 2 || colors.some(c => Number.isNaN(c))) return profile;

    const cached = cache.get(profile);
    if (cached) return cached;

    const clone = { ...profile, themeColors: [colors[0], colors[1]] };
    cache.set(profile, clone);
    return clone;
}

let unpatch: (() => boolean) | null = null;

function SettingsComponent() {
    useObservable([storage]);
    return (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingVertical: 16, gap: 16 }}>
            <Text variant="text-md/normal" color="text-muted" style={{ paddingHorizontal: 16 }}>
                Mostra as cores de perfil que outras pessoas esconderam na bio (codificação 3y3 do
                desktop). Quem colorir o perfil no PC aparece colorido aqui também.
            </Text>
            <TableRowGroup title="Opções">
                <TableSwitchRow
                    label="Priorizar tema do Nitro"
                    subLabel="Se a pessoa tiver um tema de Nitro real, mostra ele em vez da cor da bio."
                    value={storage.nitroFirst}
                    onValueChange={(v: boolean) => { storage.nitroFirst = v; }}
                />
            </TableRowGroup>
        </ScrollView>
    );
}

export const preenabled = false;

export default defineCorePlugin({
    manifest: {
        id: "pixelcord.fakeprofilethemes",
        name: "FakeProfileThemes",
        version: "1.0.0",
        description: "Mostra as cores de perfil escondidas na bio (codificação 3y3) — compatível com o desktop.",
        authors: [{ name: "myvings", id: "73598582153805824" }]
    },
    SettingsComponent,
    start() {
        if (!UserProfileStore?.getUserProfile) return;
        unpatch = after("getUserProfile", UserProfileStore, (_args: unknown[], ret: any) => apply(ret));
    },
    stop() {
        unpatch?.();
        unpatch = null;
    }
});
