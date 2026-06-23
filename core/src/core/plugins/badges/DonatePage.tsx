import { findAssetId } from "@lib/api/assets";
import { useObservable } from "@lib/api/storage";
import { showToast } from "@lib/ui/toasts";
import { findByStoreName } from "@metro";
import { clipboard, url } from "@metro/common";
import { Button, Card, Text, TextInput } from "@metro/common/components";
import { useEffect, useState } from "react";
import { Image, ScrollView, View } from "react-native";

import { API_URL } from "./lib/constants";
import { authStorage, clearToken, getAuthorizeUrl, getToken, setToken } from "./lib/auth";

const UserStore = findByStoreName("UserStore");

const MIN_REAIS = 10;
const QUICK = [10, 25, 50, 100];
const DONE_STATES = ["paid", "failed", "cancelled", "expired", "psp_failed"];

type PayMethod = "pix" | "ltc";

interface PayResult {
    kind: PayMethod;
    id: string;
    status: string;
    qrImage?: string;
    // pix
    totalCents?: number;
    pixCopyPaste?: string;
    // ltc
    address?: string;
    amountLtc?: number;
    amountBrl?: number;
    expiresAt?: string;
}

interface Donation {
    id: string;
    amountCents: number;
    status: string;
    createdAt: number;
    paidAt?: number | null;
}

function parseReais(input: string): number {
    const n = parseFloat(input.replace(",", "."));
    return Number.isFinite(n) ? n : 0;
}

function brl(cents: number): string {
    return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function statusLabel(status: string): string {
    switch (status) {
        case "paid": return "Pago";
        case "pending": return "Pendente";
        case "expired": return "Expirado";
        case "cancelled": return "Cancelado";
        case "failed":
        case "psp_failed": return "Falhou";
        default: return status;
    }
}

function formatDate(unix: number): string {
    return new Date(unix * 1000).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function DonatePage() {
    useObservable([authStorage]);
    const token = getToken();

    return token ? <DonateForm /> : <LoginView />;
}

function LoginView() {
    const [pasted, setPasted] = useState("");
    const [busy, setBusy] = useState(false);

    async function openLogin() {
        setBusy(true);
        const link = await getAuthorizeUrl();
        setBusy(false);
        if (!link) {
            showToast("Não consegui falar com a API do Pixelcord.", findAssetId("CircleXIcon"));
            return;
        }
        url.openURL(link);
    }

    return (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 14 }}>
            <Text variant="heading-lg/bold">Apoiar o Pixelcord 💜</Text>
            <Text variant="text-md/normal" color="text-muted">
                Pra registrar e mostrar suas doações, entre com sua conta do Discord. Toque em "Entrar
                com Discord", autorize, e o site vai te mostrar um token — copie e cole ele aqui embaixo.
            </Text>
            <Button
                size="lg"
                variant="primary"
                loading={busy}
                text="Entrar com Discord"
                icon={findAssetId("LinkIcon")}
                onPress={openLogin}
            />
            <TextInput
                label="Token"
                placeholder="Cole o token aqui"
                value={pasted}
                onChange={setPasted}
                isClearable
            />
            <Button
                size="lg"
                variant="secondary"
                disabled={!pasted.trim()}
                text="Salvar token"
                onPress={() => {
                    setToken(pasted.trim());
                    showToast("Conectado! 💜", findAssetId("CircleCheckIcon-primary"));
                }}
            />
        </ScrollView>
    );
}

function DonateForm() {
    const [method, setMethod] = useState<PayMethod>("pix");
    const [amount, setAmount] = useState("10");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<PayResult | null>(null);
    const [status, setStatus] = useState<string | null>(null);
    const [history, setHistory] = useState<Donation[]>([]);

    const reais = parseReais(amount);
    const valid = reais >= MIN_REAIS;

    async function loadHistory() {
        const token = getToken();
        if (!token) return;
        try {
            const res = await fetch(`${API_URL}/me/donations`, { headers: { Authorization: `Bearer ${token}` } });
            if (res.status === 401) { clearToken(); return; }
            if (res.ok) {
                const data = await res.json();
                setHistory(Array.isArray(data.donations) ? data.donations : []);
            }
        } catch { /* ignore */ }
    }

    useEffect(() => { loadHistory(); }, []);

    async function generate() {
        const token = getToken();
        if (!valid || loading || !token) return;
        setLoading(true);
        setError(null);
        try {
            const me = UserStore.getCurrentUser();
            const res = await fetch(`${API_URL}/${method}`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    amountCents: Math.round(reais * 100),
                    donorName: me?.username,
                    donorId: me?.id
                })
            });
            if (!res.ok) {
                if (res.status === 401) { clearToken(); return; }
                const txt = await res.text().catch(() => "");
                throw new Error(res.status === 503
                    ? "Esse método de pagamento não está configurado no servidor."
                    : (txt || `Erro ${res.status}`));
            }
            const data = await res.json();
            setResult({ ...data, kind: method });
            setStatus(data.status);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setLoading(false);
        }
    }

    // Poll the charge until it reaches a terminal state.
    useEffect(() => {
        if (!result?.id || (status != null && DONE_STATES.includes(status))) return;
        const iv = setInterval(async () => {
            try {
                const res = await fetch(`${API_URL}/${result.kind}/${result.id}`);
                if (!res.ok) return;
                const data = await res.json();
                setStatus(data.status);
                if (data.status === "paid") loadHistory();
            } catch { /* keep polling */ }
        }, 4000);
        return () => clearInterval(iv);
    }, [result?.id, result?.kind, status]);

    function reset() {
        setResult(null);
        setStatus(null);
    }

    // ---- Result screens ----
    if (result && status === "paid") {
        return (
            <ScrollView contentContainerStyle={{ padding: 16, gap: 14, alignItems: "center" }}>
                <Text variant="display-lg/bold" style={{ color: "#3ba55d" }}>✓</Text>
                <Text variant="heading-lg/bold">Pagamento confirmado!</Text>
                <Text variant="text-md/normal" color="text-muted">Muito obrigado pelo apoio ao Pixelcord. 💜</Text>
                <Button size="lg" variant="primary" text="Voltar" onPress={reset} />
            </ScrollView>
        );
    }

    if (result && status != null && DONE_STATES.includes(status)) {
        return (
            <ScrollView contentContainerStyle={{ padding: 16, gap: 14, alignItems: "center" }}>
                <Text variant="heading-lg/bold">Pagamento não concluído</Text>
                <Text variant="text-md/normal" color="text-muted">A cobrança expirou ou foi cancelada. Você pode gerar outra.</Text>
                <Button size="lg" variant="primary" text="Gerar outra" onPress={reset} />
            </ScrollView>
        );
    }

    if (result) {
        const isLtc = result.kind === "ltc";
        const code = isLtc ? result.address! : result.pixCopyPaste!;
        return (
            <ScrollView contentContainerStyle={{ padding: 16, gap: 12, alignItems: "center" }}>
                {result.qrImage && (
                    <Image
                        source={{ uri: result.qrImage }}
                        style={{ width: 220, height: 220, borderRadius: 12, backgroundColor: "#fff" }}
                    />
                )}
                {isLtc ? (
                    <Text variant="heading-md/semibold" style={{ textAlign: "center" }}>
                        Envie {result.amountLtc?.toFixed(8)} LTC{result.amountBrl != null ? ` (≈ ${brl(result.amountBrl)})` : ""}
                    </Text>
                ) : (
                    <Text variant="heading-md/semibold">Total: {brl(result.totalCents ?? 0)}</Text>
                )}
                <Text variant="text-sm/normal" color="text-muted" style={{ textAlign: "center" }}>
                    {isLtc
                        ? "Escaneie o QR na sua carteira Litecoin ou copie o endereço. Envie o valor exato."
                        : "Escaneie o QR no app do seu banco ou use o código copia e cola."}
                </Text>
                <Card style={{ width: "100%", padding: 12 }}>
                    <Text variant="text-sm/medium" style={{ flexWrap: "wrap" }}>{code}</Text>
                </Card>
                <Button
                    size="lg"
                    variant="primary"
                    text={isLtc ? "Copiar endereço LTC" : "Copiar código PIX"}
                    icon={findAssetId("CopyIcon")}
                    onPress={() => { clipboard.setString(code); showToast.showCopyToClipboard(); }}
                />
                <Text variant="text-sm/normal" color="text-muted">⏳ Aguardando {isLtc ? "confirmação na rede" : "pagamento"}…</Text>
                <Button size="md" variant="secondary" text="Cancelar" onPress={reset} />
            </ScrollView>
        );
    }

    // ---- Amount / method form ----
    return (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 14 }}>
            <Text variant="text-md/normal" color="text-muted">
                Sua doação ajuda no desenvolvimento do Pixelcord — via PIX ou Litecoin. Cada R$ 10,00
                dá direito a 1 Custom Badge. 💜
            </Text>

            <Text variant="eyebrow">Método</Text>
            <View style={{ flexDirection: "row", gap: 10 }}>
                <View style={{ flex: 1 }}>
                    <Button size="md" variant={method === "pix" ? "primary" : "secondary"} text="PIX" onPress={() => setMethod("pix")} />
                </View>
                <View style={{ flex: 1 }}>
                    <Button size="md" variant={method === "ltc" ? "primary" : "secondary"} text="Litecoin" onPress={() => setMethod("ltc")} />
                </View>
            </View>

            <Text variant="eyebrow">Valor da doação (R$)</Text>
            <TextInput
                value={amount}
                onChange={(v: string) => setAmount(v.replace(/[^\d.,]/g, ""))}
                placeholder="10,00"
                keyboardType="numeric"
            />
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                {QUICK.map(v => (
                    <View key={v} style={{ flexGrow: 1 }}>
                        <Button size="sm" variant={reais === v ? "primary" : "tertiary"} text={`R$ ${v}`} onPress={() => setAmount(String(v))} />
                    </View>
                ))}
            </View>

            {!valid && <Text variant="text-sm/medium" color="text-danger">Mínimo de R$ 10,00.</Text>}
            {error && <Text variant="text-sm/medium" color="text-danger">{error}</Text>}

            <Button
                size="lg"
                variant="primary"
                loading={loading}
                disabled={!valid || loading}
                text={method === "ltc" ? "Gerar Litecoin" : "Gerar PIX"}
                onPress={generate}
            />

            {history.length > 0 && (
                <View style={{ gap: 6, marginTop: 8 }}>
                    <Text variant="eyebrow">Suas doações</Text>
                    {history.map(d => (
                        <Card key={d.id} style={{ flexDirection: "row", justifyContent: "space-between", padding: 10 }}>
                            <Text variant="text-sm/medium" color="text-muted">{formatDate(d.paidAt ?? d.createdAt)}</Text>
                            <Text variant="text-sm/semibold">{brl(d.amountCents)}</Text>
                            <Text variant="text-sm/medium" color={d.status === "paid" ? "text-positive" : "text-muted"}>{statusLabel(d.status)}</Text>
                        </Card>
                    ))}
                </View>
            )}

            <Button size="md" variant="secondary" text="Sair da conta" onPress={() => { clearToken(); showToast("Desconectado.", findAssetId("TrashIcon")); }} />
        </ScrollView>
    );
}
