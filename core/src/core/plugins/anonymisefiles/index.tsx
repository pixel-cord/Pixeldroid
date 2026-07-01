import { before } from "@lib/api/patcher";
import { createStorage, useObservable } from "@lib/api/storage";
import { findByProps } from "@metro";
import { TableRow, TableRowGroup, Text } from "@metro/common/components";
import { ScrollView } from "react-native";

import { defineCorePlugin } from "..";

// AnonymiseFileNames (mobile port). Rewrites the name of files you upload so the
// original name never leaks. Hooks Discord's CloudUpload class and rewrites
// `filename` once per upload, keeping the extension.

const CloudUpload = findByProps("CloudUpload")?.CloudUpload;

type Method = "random" | "timestamp" | "consistent";

interface AnonSettings {
    method: Method;
    consistent: string;
}
const storage = createStorage<AnonSettings>("plugins/pixelcord.anonymisefiles/settings.json", {
    dflt: { method: "random", consistent: "image" }
});

const DONE = Symbol.for("pixelcord.anonymised");
const tarExt = /\.tar\.\w+$/;

function randomName(len = 7): string {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    let s = "";
    for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
}

function baseName(): string {
    switch (storage.method) {
        case "timestamp": return String(Date.now());
        case "consistent": return storage.consistent || "image";
        default: return randomName();
    }
}

function anonymise(upload: any) {
    try {
        if (!upload || upload[DONE]) return;
        const original = upload.filename;
        if (typeof original !== "string" || !original) return;

        const tar = tarExt.exec(original);
        const dot = original.lastIndexOf(".");
        const ext = tar ? tar[0] : (dot > 0 ? original.slice(dot) : "");

        upload.filename = baseName() + ext;
        upload[DONE] = true;
    } catch {
        // never block an upload over a rename
    }
}

let unpatchers: Array<() => boolean> = [];

const METHODS: Array<{ key: Method; label: string; sub: string; }> = [
    { key: "random", label: "Aleatório", sub: "Ex.: a7f3k9q.png" },
    { key: "timestamp", label: "Data/hora", sub: "Ex.: 1718900000000.png" },
    { key: "consistent", label: "Fixo", sub: `Ex.: ${"image"}.png` }
];

function SettingsComponent() {
    useObservable([storage]);
    return (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingVertical: 16, gap: 16 }}>
            <Text variant="text-md/normal" color="text-muted" style={{ paddingHorizontal: 16 }}>
                Renomeia os arquivos que você envia pra não vazar o nome original. A extensão é mantida.
            </Text>
            <TableRowGroup title="Método">
                {METHODS.map(m => (
                    <TableRow
                        key={m.key}
                        label={m.label}
                        subLabel={m.sub}
                        trailing={storage.method === m.key ? <Text variant="text-md/semibold" color="text-brand">✓</Text> : undefined}
                        onPress={() => { storage.method = m.key; }}
                    />
                ))}
            </TableRowGroup>
        </ScrollView>
    );
}

export const preenabled = false;

export default defineCorePlugin({
    manifest: {
        id: "pixelcord.anonymisefiles",
        name: "AnonymiseFileNames",
        version: "1.0.0",
        description: "Troca o nome dos arquivos que você envia por um nome anônimo (aleatório, data ou fixo), mantendo a extensão.",
        authors: [{ name: "myvings", id: "73598582153805824" }]
    },
    SettingsComponent,
    start() {
        const proto = CloudUpload?.prototype;
        if (!proto) return;
        for (const method of ["upload", "uploadFileToCloud"]) {
            if (typeof proto[method] === "function") {
                unpatchers.push(before(method, proto, function (this: any) { anonymise(this); }));
            }
        }
    },
    stop() {
        unpatchers.forEach(u => u?.());
        unpatchers = [];
    }
});
