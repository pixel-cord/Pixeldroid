import { findAssetId } from "@lib/api/assets";
import { useObservable } from "@lib/api/storage";
import { showToast } from "@lib/ui/toasts";
import { findByStoreName } from "@metro";
import { Button, FormSwitch, Text, TextInput } from "@metro/common/components";
import { useEffect, useState } from "react";
import { Image, ScrollView, View } from "react-native";

import { defineCorePlugin } from "..";
import { authStorage, clearToken, isAuthed, loginWithDiscord } from "../badges/lib/auth";
import LoginWebView from "../badges/lib/LoginWebView";
import {
    Connections,
    getMyConnections,
    getUsersConnections,
    setMyConnections
} from "./lib/api";
import { PLATFORMS } from "./lib/platforms";

// MoreConnections (mobile port). Inject extra profile connections — using REAL
// Discord connection types (instagram, lastfm) so the client renders them
// natively — into everyone's profile. Stored server-side, so they sync with the
// desktop client. A viewer just needs this plugin on to SEE others' connections;
// authorizing is only needed to set YOUR OWN.

const UserStore = findByStoreName("UserStore");
const UserProfileStore = findByStoreName("UserProfileStore");

// ---- per-user public connections cache (what we render on profiles) ----
const connCache = new Map<string, Connections>();
const requested = new Set<string>();

function requestConns(userId: string) {
    if (requested.has(userId)) return;
    requested.add(userId);
    getUsersConnections([userId])
        .then(map => connCache.set(userId, map?.[userId] ?? {}))
        .catch(() => connCache.set(userId, {}))
        .finally(() => { try { (UserProfileStore as any).emitChange?.(); } catch { /* noop */ } });
}

function extraAccounts(userId: string): any[] {
    const conns = connCache.get(userId);
    if (conns === undefined) { requestConns(userId); return []; }

    const out: any[] = [];
    for (const p of PLATFORMS) {
        const name = conns[p.id];
        if (name) out.push({ type: p.id, id: `${p.id}:${name}`, name, verified: false });
    }
    return out;
}

// ---- getUserProfile wrap: merge our connections into connectedAccounts ----
// Memoize per source-profile so referential equality holds and we don't trigger
// render loops (mirrors the desktop plugin).
const mergeCache = new Map<string, { src: any; key: string; merged: any; }>();
let originalGetUserProfile: ((userId: string) => any) | null = null;

function installInjection() {
    if (originalGetUserProfile || !UserProfileStore?.getUserProfile) return;
    const orig = UserProfileStore.getUserProfile.bind(UserProfileStore);
    originalGetUserProfile = orig;

    (UserProfileStore as any).getUserProfile = (userId: string) => {
        const profile = orig(userId);
        if (!profile) return profile;

        const extra = extraAccounts(userId);
        if (!extra.length) return profile;

        const existing: any[] = profile.connectedAccounts ?? [];
        const key = extra.map(a => `${a.type}=${a.name}`).join(",") + "#" + existing.length;

        const cached = mergeCache.get(userId);
        if (cached && cached.src === profile && cached.key === key) return cached.merged;

        const merged = [...existing];
        for (const acc of extra) {
            if (!existing.some(e => e.type === acc.type && String(e.name).toLowerCase() === acc.name.toLowerCase()))
                merged.push(acc);
        }

        const mergedProfile = { ...profile, connectedAccounts: merged };
        mergeCache.set(userId, { src: profile, key, merged: mergedProfile });
        return mergedProfile;
    };
}

function uninstallInjection() {
    if (originalGetUserProfile) {
        (UserProfileStore as any).getUserProfile = originalGetUserProfile;
        originalGetUserProfile = null;
    }
    mergeCache.clear();
    connCache.clear();
    requested.clear();
}

// Push our own connections into the public cache so our profile updates instantly.
function seedMine(conns: Connections, hidden: string[]) {
    try {
        const me = UserStore.getCurrentUser()?.id;
        if (!me) return;
        const visible: Connections = {};
        for (const [p, v] of Object.entries(conns)) if (!hidden.includes(p)) visible[p] = v;
        connCache.set(me, visible);
        mergeCache.delete(me);
        (UserProfileStore as any).emitChange?.();
    } catch { /* noop */ }
}

// ---- settings UI ----
function LoginView() {
    const [busy, setBusy] = useState(false);
    const [webOpen, setWebOpen] = useState(false);
    const [more, setMore] = useState(false);

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
            <Text variant="heading-lg/bold">Mais conexões 🔗</Text>
            <Text variant="text-md/normal" color="text-muted">
                Adicione conexões extras (Instagram, Last.fm) que aparecem no seu perfil pra todo
                mundo que usa Pixelcord. É um toque — usa a sua conta do Discord que já tá logada
                aqui. Fica salvo na sua conta, então também vale no PC.
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
    const [connections, setConnections] = useState<Connections>({});
    const [hidden, setHidden] = useState<string[]>([]);
    const [drafts, setDrafts] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        getMyConnections()
            .then(d => {
                setConnections(d.connections);
                setHidden(d.hidden);
                setDrafts({ ...d.connections });
                seedMine(d.connections, d.hidden);
            })
            .catch(() => showToast("Falha ao carregar suas conexões.", findAssetId("CircleXIcon")))
            .finally(() => setLoading(false));
    }, []);

    function persist(nextConns: Connections, nextHidden: string[]) {
        setConnections(nextConns);
        setHidden(nextHidden);
        seedMine(nextConns, nextHidden);
        setMyConnections(nextConns, nextHidden)
            .then(d => { setConnections(d.connections); setHidden(d.hidden); seedMine(d.connections, d.hidden); })
            .catch(e => showToast(`Falha ao salvar: ${e instanceof Error ? e.message : e}`, findAssetId("CircleXIcon")));
    }

    function save(platformId: string) {
        const p = PLATFORMS.find(x => x.id === platformId)!;
        const value = p.normalize(drafts[platformId] ?? "");
        const next = { ...connections };
        if (value) next[platformId] = value; else delete next[platformId];
        persist(next, hidden);
        showToast(value ? "Conexão salva 💜" : "Conexão removida", findAssetId("CircleCheckIcon-primary"));
    }

    function toggleVisible(platformId: string, visible: boolean) {
        const next = visible ? hidden.filter(p => p !== platformId) : [...hidden, platformId];
        persist(connections, next);
    }

    return (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 16 }}>
            <Text variant="text-md/normal" color="text-muted">
                As conexões salvas aparecem no seu perfil pra quem usa Pixelcord (PC e celular).
                Desligue uma pra escondê-la sem apagar o valor.
            </Text>

            {loading ? (
                <Text variant="text-md/medium" color="text-muted">Carregando…</Text>
            ) : (
                PLATFORMS.map(p => {
                    const saved = connections[p.id];
                    const visible = !hidden.includes(p.id);
                    const assetId = p.asset ? findAssetId(p.asset) : undefined;
                    return (
                        <View key={p.id} style={{ gap: 8 }}>
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                                {assetId ? (
                                    <Image source={assetId} style={{ width: 22, height: 22, borderRadius: 6 }} />
                                ) : p.iconData ? (
                                    <View style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: p.color, alignItems: "center", justifyContent: "center" }}>
                                        <Image source={{ uri: p.iconData }} style={{ width: 15, height: 15 }} resizeMode="contain" />
                                    </View>
                                ) : (
                                    <View style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: p.color, alignItems: "center", justifyContent: "center" }}>
                                        <Text variant="text-xs/bold" style={{ color: "#fff" }}>{p.name[0]}</Text>
                                    </View>
                                )}
                                <Text variant="text-md/semibold" style={{ flex: 1 }}>{p.name}</Text>
                                {saved ? <FormSwitch value={visible} onValueChange={(v: boolean) => toggleVisible(p.id, v)} /> : null}
                            </View>
                            <TextInput
                                placeholder={p.placeholder}
                                value={drafts[p.id] ?? ""}
                                onChange={(v: string) => setDrafts(d => ({ ...d, [p.id]: v }))}
                                isClearable
                            />
                            <Button
                                size="sm"
                                variant={saved ? "secondary" : "primary"}
                                text={(drafts[p.id] ?? "").trim() ? "Salvar" : (saved ? "Remover" : "Salvar")}
                                onPress={() => save(p.id)}
                            />
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

let started = false;

export default defineCorePlugin({
    manifest: {
        id: "pixelcord.moreconnections",
        name: "MoreConnections",
        version: "1.0.0",
        description: "Adicione conexões extras no perfil (Instagram, Last.fm) que aparecem pra todo mundo no Pixelcord. Sincroniza com o desktop.",
        authors: [{ name: "luvygor", id: "1499140821696647301" }]
    },
    SettingsComponent,
    start() {
        if (started) return;
        started = true;
        installInjection();
    },
    stop() {
        started = false;
        uninstallInjection();
    }
});
