import { findAssetId } from "@lib/api/assets";
import { createStorage, useObservable } from "@lib/api/storage";
import { showToast } from "@lib/ui/toasts";
import { findByProps, findByStoreName } from "@metro";
import { Button, Text as MText, TextInput } from "@metro/common/components";
import { useState } from "react";
import { Image, Pressable, ScrollView, View } from "react-native";

import { defineCorePlugin } from "..";

// AccountSwitcher (mobile). PC-style multi-account: save several accounts and
// switch between them by token. Uses Discord's OWN account-switch module
// (findByProps("login","logout","switchAccountToken")) — the same path as the
// native "add account" flow — so each login goes through Discord's genuine auth
// and presents as a normal Discord Android session (not a third-party device),
// which is the stablest, least-flag-prone way. Tokens are stored ONLY on this
// device. Opt-in (preenabled = false).

const UserStore: any = findByStoreName("UserStore");
const AuthModule: any = findByProps("login", "logout", "switchAccountToken");
const TokenModule: any = findByProps("getToken");

interface Account {
    id: string;
    username: string;
    avatar: string | null;
    token: string;
}
interface ASStorage {
    accounts: Record<string, Account>;
    order: string[];
}
const storage = createStorage<ASStorage>("plugins/pixelcord.accountswitcher/data.json", {
    dflt: { accounts: {}, order: [] }
});

function currentToken(): string | null {
    try { return TokenModule?.getToken?.() ?? null; } catch { return null; }
}

// Capture the logged-in account so it's never lost when switching away.
function saveCurrent(): Account | null {
    try {
        const token = currentToken();
        const u = UserStore?.getCurrentUser?.();
        if (!token || !u?.id) return null;
        const acc: Account = { id: u.id, username: u.username, avatar: u.avatar ?? null, token };
        if (!storage.accounts[u.id]) storage.order = [...storage.order, u.id];
        storage.accounts = { ...storage.accounts, [u.id]: acc };
        return acc;
    } catch { return null; }
}

// Log in / switch using Discord's native account-switch. Errors never crash:
// the account stays saved so the user can retry.
async function switchTo(token: string): Promise<void> {
    const t = token?.trim();
    if (!t) return;
    const fn = AuthModule?.switchAccountToken ?? AuthModule?.loginToken;
    if (typeof fn !== "function") {
        showToast("Login por token indisponível nesta versão.", findAssetId("CircleXIcon"));
        return;
    }
    // Make sure the account we're leaving is saved before we go.
    saveCurrent();
    try {
        showToast("Entrando…", findAssetId("ic_progress_indeterminate") ?? findAssetId("ic_sync"));
        await Promise.resolve(fn.call(AuthModule, t));
    } catch {
        showToast("Falha ao entrar — sua conta foi mantida, tente de novo.", findAssetId("CircleXIcon"));
    }
}

function avatarUri(a: Account): string {
    if (a.avatar) return `https://cdn.discordapp.com/avatars/${a.id}/${a.avatar}.png?size=64`;
    return "https://cdn.discordapp.com/embed/avatars/0.png";
}

function SettingsComponent() {
    useObservable([storage]);
    const [token, setToken] = useState("");
    const meId: string | undefined = UserStore?.getCurrentUser?.()?.id;
    const accounts = storage.order.map(id => storage.accounts[id]).filter(Boolean) as Account[];

    const remove = (id: string) => {
        const next = { ...storage.accounts };
        delete next[id];
        storage.accounts = next;
        storage.order = storage.order.filter(x => x !== id);
        showToast("Conta removida.", findAssetId("TrashIcon"));
    };

    const addByToken = () => {
        const t = token.trim();
        if (!t) {
            showToast("Cole um token primeiro.", findAssetId("CircleXIcon"));
            return;
        }
        setToken("");
        switchTo(t);
    };

    return (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingVertical: 16, gap: 16, paddingHorizontal: 14 }}>
            <View style={{ padding: 12, borderRadius: 12, backgroundColor: "rgba(242,63,67,0.12)" }}>
                <MText variant="text-sm/medium" style={{ color: "#f0b232" }}>
                    ⚠️ O token dá acesso TOTAL à conta. Fica salvo só neste aparelho — nunca compartilhe.
                    Usa o login nativo do Discord, então a sessão aparece como um acesso normal do app.
                </MText>
            </View>

            <View style={{ gap: 8 }}>
                <MText variant="eyebrow" color="text-muted">Entrar com outra conta (token)</MText>
                <TextInput
                    value={token}
                    onChange={setToken}
                    placeholder="Cole o token aqui"
                    isClearable
                    secureTextEntry
                />
                <Button size="md" variant="primary" text="Entrar" onPress={addByToken} />
            </View>

            <View style={{ gap: 8 }}>
                <MText variant="eyebrow" color="text-muted">Contas salvas</MText>
                {accounts.length === 0 ? (
                    <MText variant="text-md/normal" color="text-muted">
                        Nenhuma conta salva ainda. Entre numa conta e ela é salva automaticamente.
                    </MText>
                ) : accounts.map(a => {
                    const isCurrent = a.id === meId;
                    return (
                        <View key={a.id} style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.04)" }}>
                            <Image source={{ uri: avatarUri(a) }} style={{ width: 34, height: 34, borderRadius: 17 }} />
                            <View style={{ flex: 1 }}>
                                <MText variant="text-md/semibold">{a.username}</MText>
                                {isCurrent ? <MText variant="text-sm/medium" style={{ color: "#23a55a" }}>Conta atual</MText> : null}
                            </View>
                            {!isCurrent ? (
                                <Button size="sm" variant="secondary" text="Trocar" onPress={() => switchTo(a.token)} />
                            ) : null}
                            <Pressable onPress={() => remove(a.id)} hitSlop={8}>
                                <Image source={findAssetId("TrashIcon")} style={{ width: 18, height: 18, tintColor: "#f23f43" }} />
                            </Pressable>
                        </View>
                    );
                })}
            </View>

            <Button size="md" variant="tertiary" text="Salvar conta atual" onPress={() => { const a = saveCurrent(); showToast(a ? `Salvo: ${a.username}` : "Nenhuma conta ativa.", findAssetId("CircleCheckIcon-primary")); }} />
        </ScrollView>
    );
}

export const preenabled = false;

export default defineCorePlugin({
    manifest: {
        id: "pixelcord.accountswitcher",
        name: "AccountSwitcher",
        version: "1.0.0",
        description: "Várias contas tipo PC: entre por token e troque entre elas. Usa o login nativo do Discord (sessão normal). Tokens ficam só no seu aparelho.",
        authors: [{ name: "myvings", id: "73598582153805824" }]
    },
    SettingsComponent,
    start() {
        // Save the account you're currently on so switching never loses it.
        saveCurrent();
    },
    stop() { /* nothing to unpatch */ }
});
