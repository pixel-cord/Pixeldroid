import { findAssetId } from "@lib/api/assets";
import { useObservable } from "@lib/api/storage";
import { showToast } from "@lib/ui/toasts";
import { findByStoreName } from "@metro";
import { Button, FormSwitch, Text } from "@metro/common/components";
import { useEffect, useMemo, useState } from "react";
import { Image, ScrollView, View } from "react-native";

import { defineCorePlugin } from "..";
import { invalidateHidden } from "../badges";
import { authStorage, clearToken, isAuthed, loginWithDiscord } from "../badges/lib/auth";
import LoginWebView from "../badges/lib/LoginWebView";
import { getMyHidden, setMyHidden } from "./api";
import { fetchMyBadges, ManageableBadge } from "./feeds";

const UserStore = findByStoreName("UserStore");
const UserProfileStore = findByStoreName("UserProfileStore");

// Resolve a native Discord badge's icon to an <Image> source (url or asset id).
function nativeBadgeIcon(b: any): any {
    if (b?.iconSrc) return { uri: b.iconSrc };
    if (typeof b?.icon === "string") return { uri: `https://cdn.discordapp.com/badge-icons/${b.icon}.png` };
    if (typeof b?.icon === "number") return b.icon;
    return null;
}

// Current user's NATIVE Discord badges (premium, guild_booster, legacy_username,
// quest_completed…) read straight from the profile store so they can be hidden
// too, matching the desktop manage UI. (The useBadges hook returns nothing when
// called outside a profile render, so we read the store directly.)
function getNativeBadges(userId?: string): any[] {
    try {
        const b = UserProfileStore?.getUserProfile?.(userId)?.badges;
        return Array.isArray(b) ? b : [];
    } catch {
        return [];
    }
}

// Hide your own badges for everyone on Pixelcord. The hidden set is stored on the
// backend, so what you hide here also hides on desktop (and vice-versa).

function LoginView() {
    const [busy, setBusy] = useState(false);
    const [webOpen, setWebOpen] = useState(false);
    const [more, setMore] = useState(false);

    // Browser fallback — only if the native login ever fails.
    if (webOpen) {
        return (
            <View style={{ flex: 1 }}>
                <LoginWebView onDone={() => { setWebOpen(false); showToast("Conectado! 💜", findAssetId("CircleCheckIcon-primary")); }} />
            </View>
        );
    }

    async function nativeLogin() {
        setBusy(true);
        try {
            await loginWithDiscord();
            showToast("Conectado! 💜", findAssetId("CircleCheckIcon-primary"));
        } catch (e) {
            showToast(`Falha ao conectar: ${e instanceof Error ? e.message : e}`, findAssetId("CircleXIcon"));
        } finally {
            setBusy(false);
        }
    }

    return (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 14 }}>
            <Text variant="heading-lg/bold">Esconder badges 🙈</Text>
            <Text variant="text-md/normal" color="text-muted">
                Escolha quais das SUAS badges esconder de todo mundo no Pixelcord. É um toque —
                usa a sua conta do Discord que já tá logada aqui, sem copiar nada. O que você
                esconder também vale no PC (fica salvo na sua conta).
            </Text>
            <Button
                size="lg"
                variant="primary"
                text={busy ? "Conectando…" : "Entrar com Discord"}
                disabled={busy}
                icon={findAssetId("LinkIcon")}
                onPress={nativeLogin}
            />

            <Button size="sm" variant="tertiary" text={more ? "Esconder opções" : "Problemas? Outras opções"} onPress={() => setMore(!more)} />
            {more && (
                <Button size="md" variant="secondary" text="Autorizar pelo navegador" onPress={() => setWebOpen(true)} />
            )}
        </ScrollView>
    );
}

interface DisplayBadge {
    id: string;
    label: string;
    icon: any;
}

function ManageView() {
    let me: string | undefined;
    try {
        me = UserStore.getCurrentUser()?.id;
    } catch {
        me = undefined;
    }

    const [native, setNative] = useState<any[]>([]);
    const [ours, setOurs] = useState<ManageableBadge[]>([]);
    const [hidden, setHidden] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setNative(getNativeBadges(me));
        Promise.all([fetchMyBadges(), getMyHidden().catch(() => [])])
            .then(([b, h]) => { setOurs(b); setHidden(h); })
            .catch(() => showToast("Falha ao carregar suas badges.", findAssetId("CircleXIcon")))
            .finally(() => setLoading(false));
    }, []);

    // Native Discord badges first (profile order), then our donor/contributor
    // badges; dedupe by id. Mirrors the desktop getAllBadges list.
    const badges = useMemo<DisplayBadge[]>(() => {
        const seen = new Set<string>();
        const list: DisplayBadge[] = [];
        for (const b of native) {
            if (!b?.id || seen.has(b.id)) continue;
            seen.add(b.id);
            list.push({ id: b.id, label: b.description || b.label || b.id, icon: nativeBadgeIcon(b) });
        }
        for (const b of ours) {
            if (seen.has(b.id)) continue;
            seen.add(b.id);
            list.push({ id: b.id, label: b.label, icon: { uri: b.icon } });
        }
        return list;
    }, [native, ours]);

    function toggle(id: string, visible: boolean) {
        const next = visible ? hidden.filter(x => x !== id) : [...hidden, id];
        setHidden(next);
        // Refresh the rendered badges right away (no restart) for our own profile.
        invalidateHidden(me);
        setMyHidden(next)
            .then(() => invalidateHidden(me))
            .catch(e => showToast(`Falha ao salvar: ${e instanceof Error ? e.message : e}`, findAssetId("CircleXIcon")));
    }

    return (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 12 }}>
            <Text variant="text-md/normal" color="text-muted">
                Badges desligadas somem do seu perfil pra todo mundo que usa Pixelcord (PC e celular).
                Inclui as nativas do Discord.
            </Text>

            {loading ? (
                <Text variant="text-md/medium" color="text-muted">Carregando…</Text>
            ) : badges.length === 0 ? (
                <Text variant="text-md/medium" color="text-muted">Nenhuma badge encontrada no seu perfil.</Text>
            ) : (
                badges.map(b => {
                    const visible = !hidden.includes(b.id);
                    return (
                        <View key={b.id} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 4 }}>
                            {b.icon ? <Image source={b.icon} style={{ width: 26, height: 26, borderRadius: 6 }} /> : <View style={{ width: 26, height: 26 }} />}
                            <Text variant="text-md/medium" style={{ flex: 1 }}>{b.label}</Text>
                            <FormSwitch value={visible} onValueChange={(v: boolean) => toggle(b.id, v)} />
                        </View>
                    );
                })
            )}

            <Button
                size="md"
                variant="secondary"
                text="Sair da conta"
                style={{ marginTop: 8 }}
                onPress={() => { clearToken(); showToast("Desconectado.", findAssetId("TrashIcon")); }}
            />
        </ScrollView>
    );
}

function SettingsComponent() {
    useObservable([authStorage]);
    return isAuthed() ? <ManageView /> : <LoginView />;
}

export default defineCorePlugin({
    manifest: {
        id: "pixelcord.hidebadges",
        name: "HideBadges",
        version: "1.0.0",
        description: "Esconda suas próprias badges pra todo mundo no Pixelcord. Sincroniza com o desktop (os dados ficam na sua conta).",
        authors: [{ name: "myvings", id: "73598582153805824" }]
    },
    SettingsComponent
});
