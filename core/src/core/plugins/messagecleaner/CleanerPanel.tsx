import { hideSheet } from "@lib/ui/sheets";
import { ActionSheet, BottomSheetTitleHeader, Button, Card, Text, TextInput } from "@metro/common/components";
import { useRef, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";

import { CleanProgress, engineReady, runClean } from "./engine";

export const CLEANER_SHEET_KEY = "PixelcordCleaner";

const TYPES = [
    { key: "image", label: "Imagens" },
    { key: "video", label: "Vídeos" },
    { key: "file", label: "Arquivos" },
    { key: "sound", label: "Áudio" },
    { key: "embed", label: "Embeds" },
    { key: "link", label: "Links" }
];

const SPEEDS = [
    { key: "safe", label: "Seguro", delay: 2000 },
    { key: "normal", label: "Normal", delay: 1000 },
    { key: "fast", label: "Rápido", delay: 500 }
];

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void; }) {
    return (
        <Pressable
            onPress={onPress}
            style={{
                paddingVertical: 9,
                paddingHorizontal: 14,
                borderRadius: 999,
                marginRight: 8,
                marginBottom: 8,
                backgroundColor: on ? "#5865f2" : "rgba(127,127,127,0.18)"
            }}
        >
            <Text variant="text-sm/semibold" style={{ color: on ? "#fff" : "#dbdee1" }}>{label}</Text>
        </Pressable>
    );
}

export default function CleanerPanel({ channelId, channelName }: { channelId: string; channelName: string; }) {
    const [has, setHas] = useState<string[]>([]);
    const [contains, setContains] = useState("");
    const [limit, setLimit] = useState("");
    const [speed, setSpeed] = useState("normal");
    const [progress, setProgress] = useState<CleanProgress | null>(null);
    const cancelRef = useRef(false);

    const running = progress?.phase === "scanning" || progress?.phase === "deleting";
    const toggleHas = (k: string) => setHas(has.includes(k) ? has.filter(x => x !== k) : [...has, k]);

    function start() {
        if (!engineReady()) {
            setProgress({ phase: "error", found: 0, deleted: 0, total: 0, error: "API do Discord indisponível." });
            return;
        }
        cancelRef.current = false;
        setProgress({ phase: "scanning", found: 0, deleted: 0, total: 0 });
        const delay = SPEEDS.find(s => s.key === speed)!.delay;
        runClean(
            channelId,
            { has, contains, limit: limit ? parseInt(limit, 10) : null, delay },
            { onUpdate: setProgress, isCancelled: () => cancelRef.current }
        );
    }

    const pct = progress && progress.total > 0 ? Math.round((progress.deleted / progress.total) * 100) : 0;

    return (
        <ActionSheet>
            <BottomSheetTitleHeader title="Limpar minhas mensagens" />
            <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 28, gap: 16 }}>
                <Text variant="text-sm/medium" color="text-muted">#{channelName}</Text>

                <Card style={{ padding: 12 }}>
                    <Text variant="text-sm/medium" style={{ color: "#f23f43" }}>
                        ⚠️ Apagar mensagens em massa pode te dar rate-limit ou flag na conta. Só apaga as
                        SUAS mensagens. Use por sua conta e risco.
                    </Text>
                </Card>

                {!progress || progress.phase === "done" || progress.phase === "error" || progress.phase === "cancelled" ? (
                    <>
                        <View>
                            <Text variant="eyebrow">Tipos (vazio = tudo)</Text>
                            <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 8 }}>
                                {TYPES.map(t => (
                                    <Chip key={t.key} label={t.label} on={has.includes(t.key)} onPress={() => toggleHas(t.key)} />
                                ))}
                            </View>
                        </View>

                        <View style={{ gap: 8 }}>
                            <Text variant="eyebrow">Contém (opcional)</Text>
                            <TextInput value={contains} onChange={setContains} placeholder="Só mensagens com este texto" isClearable />
                        </View>

                        <View style={{ gap: 8 }}>
                            <Text variant="eyebrow">Limite (vazio = todas)</Text>
                            <TextInput value={limit} onChange={(v: string) => setLimit(v.replace(/\D/g, ""))} placeholder="Ex.: 100" keyboardType="numeric" />
                        </View>

                        <View>
                            <Text variant="eyebrow">Velocidade</Text>
                            <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                                {SPEEDS.map(s => (
                                    <View key={s.key} style={{ flex: 1 }}>
                                        <Button size="md" variant={speed === s.key ? "primary" : "secondary"} text={s.label} onPress={() => setSpeed(s.key)} />
                                    </View>
                                ))}
                            </View>
                            <Text variant="text-sm/normal" color="text-muted" style={{ marginTop: 6 }}>Mais lento = mais seguro contra rate-limit.</Text>
                        </View>

                        {progress?.phase === "done" && (
                            <Text variant="text-md/semibold" style={{ color: "#23a55a" }}>
                                {progress.total === 0 ? "Nenhuma mensagem encontrada." : `✅ ${progress.deleted} mensagem(ns) apagada(s).`}
                            </Text>
                        )}
                        {progress?.phase === "error" && <Text variant="text-md/semibold" style={{ color: "#f23f43" }}>❌ {progress.error}</Text>}
                        {progress?.phase === "cancelled" && <Text variant="text-md/semibold" color="text-muted">Cancelado. Apagadas: {progress.deleted}.</Text>}

                        <Button size="lg" variant="primary" text="Limpar agora" onPress={start} />
                    </>
                ) : (
                    <View style={{ gap: 14, alignItems: "center", paddingVertical: 8 }}>
                        {progress.phase === "scanning" ? (
                            <Text variant="heading-md/semibold">🔎 Procurando… {progress.found} encontradas</Text>
                        ) : (
                            <>
                                <Text variant="heading-md/semibold">🧹 Apagando {progress.deleted}/{progress.total}</Text>
                                <View style={{ width: "100%", height: 8, borderRadius: 4, backgroundColor: "rgba(127,127,127,0.25)" }}>
                                    <View style={{ width: `${pct}%`, height: 8, borderRadius: 4, backgroundColor: "#5865f2" }} />
                                </View>
                            </>
                        )}
                        <Button
                            size="md"
                            variant="secondary"
                            text="Cancelar"
                            onPress={() => { cancelRef.current = true; }}
                        />
                    </View>
                )}

                <Button size="sm" variant="tertiary" text="Fechar" onPress={() => hideSheet(CLEANER_SHEET_KEY)} />
            </ScrollView>
        </ActionSheet>
    );
}
