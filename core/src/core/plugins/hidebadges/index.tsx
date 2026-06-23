import { findAssetId } from "@lib/api/assets";
import { useObservable } from "@lib/api/storage";
import { showToast } from "@lib/ui/toasts";
import { Button, FormSwitch, Text } from "@metro/common/components";
import { useEffect, useState } from "react";
import { Image, ScrollView, View } from "react-native";

import { defineCorePlugin } from "..";
import { authStorage, clearToken, isAuthed, loginWithDiscord } from "../badges/lib/auth";
import LoginWebView from "../badges/lib/LoginWebView";
import { getMyHidden, setMyHidden } from "./api";
import { fetchMyBadges, ManageableBadge } from "./feeds";

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

function ManageView() {
    const [badges, setBadges] = useState<ManageableBadge[]>([]);
    const [hidden, setHidden] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        Promise.all([fetchMyBadges(), getMyHidden().catch(() => [])])
            .then(([b, h]) => { setBadges(b); setHidden(h); })
            .catch(() => showToast("Falha ao carregar suas badges.", findAssetId("CircleXIcon")))
            .finally(() => setLoading(false));
    }, []);

    function toggle(id: string, visible: boolean) {
        const next = visible ? hidden.filter(x => x !== id) : [...hidden, id];
        setHidden(next);
        setMyHidden(next).catch(e => showToast(`Falha ao salvar: ${e instanceof Error ? e.message : e}`, findAssetId("CircleXIcon")));
    }

    return (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 12 }}>
            <Text variant="text-md/normal" color="text-muted">
                Badges desligadas somem do seu perfil pra todo mundo que usa Pixelcord (PC e celular).
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
                            <Image source={{ uri: b.icon }} style={{ width: 26, height: 26, borderRadius: 6 }} />
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
        authors: [{ name: "outlayer", id: "1499140821696647301" }]
    },
    SettingsComponent
});
