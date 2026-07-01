import { before } from "@lib/api/patcher";
import { createStorage, useObservable } from "@lib/api/storage";
import { findByProps } from "@metro";
import { Button, FormSwitch, Text as MText, TextInput } from "@metro/common/components";
import { useState } from "react";
import { ScrollView, View } from "react-native";

import { defineCorePlugin } from "..";

// TextReplace (mobile). Rewrites your OUTGOING messages with find/replace rules
// (plain or regex) before they're sent, e.g. "brb" -> "be right back". Same rule
// semantics as the desktop plugin. Only your own messages (the clean
// before-sendMessage path); the desktop "others' messages" scope needs render
// patching and isn't ported. Opt-in (preenabled = false).

interface Rule {
    find: string;
    replace: string;
    onlyIf: string;
    regex: boolean;
}
interface TRSettings {
    rules: Rule[];
}
const storage = createStorage<TRSettings>("plugins/pixelcord.textreplace/settings.json", {
    dflt: { rules: [] }
});

function stringToRegex(str: string): RegExp {
    const match = str.match(/^(\/)?(.+?)(?:\/([gimsuyv]*))?$/);
    return match
        ? new RegExp(
            match[2],
            match[3]
                ?.split("")
                .filter((char, pos, arr) => arr.indexOf(char) === pos)
                .join("") ?? "g"
        )
        : new RegExp(str);
}

function applyRules(content: string): string {
    if (!content) return content;
    for (const rule of storage.rules) {
        if (!rule.find) continue;
        if (rule.onlyIf && !content.includes(rule.onlyIf)) continue;
        const replacement = (rule.replace ?? "").replaceAll("\\n", "\n");
        if (rule.regex) {
            try {
                content = content.replace(stringToRegex(rule.find), replacement);
            } catch { /* invalid regex — skip */ }
        } else {
            content = ` ${content} `.replaceAll(rule.find, replacement).replace(/^\s|\s$/g, "");
        }
    }
    return content.trim();
}

let unpatchers: Array<() => boolean> = [];

const emptyRule = (): Rule => ({ find: "", replace: "", onlyIf: "", regex: false });

function SettingsComponent() {
    useObservable([storage]);
    const [rules, setRules] = useState<Rule[]>(() => (storage.rules.length ? storage.rules : []));

    const commit = (next: Rule[]) => { setRules(next); storage.rules = next; };
    const update = (i: number, key: keyof Rule, val: string | boolean) =>
        commit(rules.map((r, idx) => (idx === i ? { ...r, [key]: val } : r)));
    const add = () => commit([...rules, emptyRule()]);
    const remove = (i: number) => commit(rules.filter((_, idx) => idx !== i));

    return (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingVertical: 16, gap: 14, paddingHorizontal: 12 }}>
            <MText variant="text-md/normal" color="text-muted">
                Substitui texto nas SUAS mensagens antes de enviar. Ex.: achar "brb" e trocar por "be right back".
                Ligue "Regex" pra usar expressões regulares.
            </MText>

            {rules.length === 0 ? (
                <MText variant="text-md/normal" color="text-muted" style={{ textAlign: "center", paddingVertical: 8 }}>
                    Nenhuma regra ainda.
                </MText>
            ) : (
                rules.map((r, i) => (
                    <View key={i} style={{ gap: 8, padding: 12, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.04)" }}>
                        <TextInput label="Achar" value={r.find} onChange={(v: string) => update(i, "find", v)} placeholder="brb" isClearable />
                        <TextInput label="Trocar por" value={r.replace} onChange={(v: string) => update(i, "replace", v)} placeholder="be right back" isClearable />
                        <TextInput label="Só se contiver (opcional)" value={r.onlyIf} onChange={(v: string) => update(i, "onlyIf", v)} placeholder="" isClearable />
                        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                            <MText variant="text-md/semibold">Regex</MText>
                            <FormSwitch value={r.regex} onValueChange={(v: boolean) => update(i, "regex", v)} />
                        </View>
                        <Button size="sm" variant="destructive" text="Remover regra" onPress={() => remove(i)} />
                    </View>
                ))
            )}

            <Button size="md" variant="primary" text="Adicionar regra" onPress={add} />
        </ScrollView>
    );
}

export const preenabled = false;

export default defineCorePlugin({
    manifest: {
        id: "pixelcord.textreplace",
        name: "TextReplace",
        version: "1.0.0",
        description: "Substitui texto nas suas mensagens antes de enviar (regras simples ou regex).",
        authors: [{ name: "myvings", id: "73598582153805824" }]
    },
    SettingsComponent,
    start() {
        const MessageActions = findByProps("sendMessage", "editMessage");
        if (!MessageActions) return;
        unpatchers.push(before("sendMessage", MessageActions, (args: any[]) => {
            const msg = args?.[1];
            if (msg && typeof msg.content === "string" && msg.content.length) {
                msg.content = applyRules(msg.content);
            }
        }));
        unpatchers.push(before("editMessage", MessageActions, (args: any[]) => {
            const edit = args?.[2];
            if (edit && typeof edit.content === "string" && edit.content.length) {
                edit.content = applyRules(edit.content);
            }
        }));
    },
    stop() {
        unpatchers.forEach(u => u?.());
        unpatchers = [];
    }
});
