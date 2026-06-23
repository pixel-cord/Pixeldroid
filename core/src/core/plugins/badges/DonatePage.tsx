import { findAssetId } from "@lib/api/assets";
import { showToast } from "@lib/ui/toasts";
import { findByStoreName } from "@metro";
import { clipboard } from "@metro/common";
import { Button, Card, Text, TextInput } from "@metro/common/components";
import { useEffect, useState } from "react";
import { Image, ScrollView, View } from "react-native";

import { API_URL } from "./lib/constants";

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
    totalCents?: number;
    pixCopyPaste?: string;
    address?: string;
    amountLtc?: number;
    amountBrl?: number;
    expiresAt?: string;
}

function parseReais(input: string): number {
    const n = parseFloat(input.replace(",", "."));
    return Number.isFinite(n) ? n : 0;
}

function brl(cents: number): string {
    return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Top-level page: a toggle between the donate flow and the custom-badge manager
// (create / my badges). The badge manager UI is laid out to match desktop but is
// not wired to login yet — the user will decide the badge-creation flow later.
export default function DonatePage() {
    const [tab, setTab] = useState<"donate" | "badges">("donate");

    return (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 14 }}>
            <View style={{ flexDirection: "row", gap: 10 }}>
                <View style={{ flex: 1 }}>
                    <Button size="md" variant={tab === "donate" ? "primary" : "secondary"} text="Doar" onPress={() => setTab("donate")} />
                </View>
                <View style={{ flex: 1 }}>
                    <Button size="md" variant={tab === "badges" ? "primary" : "secondary"} text="Custom Badges" onPress={() => setTab("badges")} />
                </View>
            </View>
            {tab === "donate" ? <DonateView /> : <BadgesView />}
        </ScrollView>
    );
}

// No login: donations are attributed straight to your Discord id, which the
// backend grants the badge to once the charge is paid.
function DonateView() {
    const [method, setMethod] = useState<PayMethod>("pix");
    const [amount, setAmount] = useState("10");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<PayResult | null>(null);
    const [status, setStatus] = useState<string | null>(null);

    const reais = parseReais(amount);
    const valid = reais >= MIN_REAIS;

    async function generate() {
        if (!valid || loading) return;
        const me = UserStore.getCurrentUser();
        if (!me?.id) {
            setError("Não consegui ler sua conta do Discord.");
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`${API_URL}/${method}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    amountCents: Math.round(reais * 100),
                    donorName: me.username,
                    donorId: me.id
                })
            });
            if (!res.ok) {
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
            } catch { /* keep polling */ }
        }, 4000);
        return () => clearInterval(iv);
    }, [result?.id, result?.kind, status]);

    function reset() {
        setResult(null);
        setStatus(null);
    }

    if (result && status === "paid") {
        return (
            <View style={{ gap: 14, alignItems: "center" }}>
                <Text variant="display-lg/bold" style={{ color: "#3ba55d" }}>✓</Text>
                <Text variant="heading-lg/bold">Pagamento confirmado!</Text>
                <Text variant="text-md/normal" color="text-muted">Muito obrigado pelo apoio ao Pixelcord. 💜</Text>
                <Button size="lg" variant="primary" text="Voltar" onPress={reset} />
            </View>
        );
    }

    if (result && status != null && DONE_STATES.includes(status)) {
        return (
            <View style={{ gap: 14, alignItems: "center" }}>
                <Text variant="heading-lg/bold">Pagamento não concluído</Text>
                <Text variant="text-md/normal" color="text-muted">A cobrança expirou ou foi cancelada. Você pode gerar outra.</Text>
                <Button size="lg" variant="primary" text="Gerar outra" onPress={reset} />
            </View>
        );
    }

    if (result) {
        const isLtc = result.kind === "ltc";
        const code = isLtc ? result.address! : result.pixCopyPaste!;
        return (
            <View style={{ gap: 12, alignItems: "center" }}>
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
                    <Text variant="text-sm/medium">{code}</Text>
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
            </View>
        );
    }

    return (
        <View style={{ gap: 14 }}>
            <Text variant="text-md/normal" color="text-muted">
                Sua doação ajuda no desenvolvimento do Pixelcord — via PIX ou Litecoin. Cada R$ 10,00
                dá direito a 1 Custom Badge. A badge vai pra sua conta do Discord assim que o pagamento
                for confirmado. 💜
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
        </View>
    );
}

// Custom-badge manager — laid out like the desktop CustomBadgeSection (credits,
// "Criar Custom Badge", "Minhas Custom Badges"). NOT wired to login yet: the
// create button just explains it needs login, which the user will design later.
function BadgesView() {
    const [tooltip, setTooltip] = useState("");
    const [image, setImage] = useState("");

    const notReady = () => showToast(
        "Login ainda não conectado — em breve.",
        findAssetId("CircleInformationIcon-primary") ?? findAssetId("ic_info")
    );

    return (
        <View style={{ gap: 14 }}>
            <Text variant="heading-lg/bold">Custom Badge</Text>
            <Text variant="text-md/normal" color="text-muted">
                A cada R$ 10,00 doados você ganha 1 Custom Badge. Envie uma imagem (até 5 MB) — toda
                badge passa por aprovação.
            </Text>

            <Card style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 14 }}>
                <Text variant="display-md/bold">—</Text>
                <Text variant="text-md/medium" color="text-muted">badge(s) disponível(is)</Text>
            </Card>

            <Text variant="eyebrow">Nome da badge</Text>
            <TextInput value={tooltip} onChange={setTooltip} placeholder="Ex.: Apoiador Pixelcord" isClearable />

            <Text variant="eyebrow">Link da imagem</Text>
            <TextInput value={image} onChange={setImage} placeholder="https://…/badge.png" isClearable />

            <Button
                size="lg"
                variant="primary"
                text="Criar Custom Badge"
                icon={findAssetId("PlusLargeIcon") ?? findAssetId("PlusIcon")}
                onPress={notReady}
            />

            <Text variant="heading-lg/bold" style={{ marginTop: 8 }}>Minhas Custom Badges</Text>
            <Card style={{ padding: 16, alignItems: "center" }}>
                <Text variant="text-md/medium" color="text-muted">Você ainda não tem custom badges.</Text>
            </Card>
            <Text variant="text-sm/normal" color="text-muted">
                Entre com o Discord para criar e gerenciar suas badges. (Login será conectado em breve.)
            </Text>
        </View>
    );
}
