import { after } from "@lib/api/patcher";
import { findByStoreName } from "@metro";

import { defineCorePlugin } from "..";

// NoProfileThemes — strip other people's Nitro profile themes (custom banner/
// accent colors and profile effects) so profiles render in the default style.
// Wraps the same getUserProfile the client reads everywhere; a WeakMap keyed by
// the source profile keeps referential equality so it doesn't churn renders.

const UserProfileStore = findByStoreName("UserProfileStore");
const cache = new WeakMap<any, any>();

function strip(profile: any): any {
    if (!profile) return profile;
    if (profile.themeColors == null && profile.accentColor == null && !profile.profileEffectId) return profile;

    const cached = cache.get(profile);
    if (cached) return cached;

    const clone = {
        ...profile,
        themeColors: null,
        accentColor: null,
        profileEffectId: null,
        profileEffectExpiresAt: null
    };
    cache.set(profile, clone);
    return clone;
}

let unpatch: (() => boolean) | null = null;

export const preenabled = false;

export default defineCorePlugin({
    manifest: {
        id: "pixelcord.noprofilethemes",
        name: "NoProfileThemes",
        version: "1.0.0",
        description: "Remove os temas de perfil (cores e efeitos do Nitro) das outras pessoas, deixando os perfis no estilo padrão.",
        authors: [{ name: "myvings", id: "73598582153805824" }]
    },
    start() {
        if (!UserProfileStore?.getUserProfile) return;
        unpatch = after("getUserProfile", UserProfileStore, (_args: unknown[], ret: any) => strip(ret));
    },
    stop() {
        unpatch?.();
        unpatch = null;
    }
});
