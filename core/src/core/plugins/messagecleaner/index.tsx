import { registerCommand } from "@lib/api/commands";
import { ApplicationCommandOptionType } from "@lib/api/commands/types";
import { showToast } from "@lib/ui/toasts";
import { findByProps, findByStoreName } from "@metro";
import { messageUtil } from "@metro/common";

import { defineCorePlugin } from "..";

// Port of the desktop MessageCleaner: bulk-delete your own messages in the
// current channel. The desktop trigger is a chat-bar button + modal with a
// per-channel queue; mobile has no chat-button API yet, so the trigger here is
// the `/clean` command (a chat-bar button can be added later via UI injection).
//
// ⚠️ Bulk self-deletion technically violates Discord's ToS — opt-in, use at your
// own risk. Paced with delays + jitter to stay gentle on rate limits.
export const preenabled = false;

const RestAPI = findByProps("getAPIBaseURL", "get", "del");
const Constants = findByProps("Endpoints");
const UserStore = findByStoreName("UserStore");

const BLOCK = 1;        // messages deleted per batch (gentle)
const DELAY = 1000;     // ms between batches

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function chunk<T>(arr: T[], n: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
    return out;
}

function isAlreadyGone(reason: any): boolean {
    return reason?.status === 404 || reason?.body?.code === 10008;
}

let running = false;

async function runClean(channelId: string, report: (msg: string) => void, opts: { limit?: number; contains?: string; }) {
    if (running) {
        report("⚠️ Já tem uma limpeza rodando. Espere ela terminar.");
        return;
    }
    if (!RestAPI || !Constants?.Endpoints) {
        report("❌ Não consegui acessar a API de mensagens do Discord.");
        return;
    }

    running = true;
    try {
        const me = UserStore.getCurrentUser()?.id;
        const limit = opts.limit && opts.limit > 0 ? opts.limit : Infinity;
        const contains = (opts.contains ?? "").trim().toLowerCase();

        // Phase 1 — scan the channel and collect ids of our matching messages.
        const ids: string[] = [];
        let before: string | undefined;
        while (ids.length < limit) {
            const query: Record<string, any> = { limit: 100 };
            if (before) query.before = before;

            const res = await RestAPI.get({ url: Constants.Endpoints.MESSAGES(channelId), query });
            const page: any[] = res.body ?? [];
            if (!page.length) break;

            before = page[page.length - 1].id;
            for (const m of page) {
                if (m.author?.id === me && (!contains || (m.content ?? "").toLowerCase().includes(contains))) {
                    ids.push(m.id);
                    if (ids.length >= limit) break;
                }
            }
            if (page.length < 100) break;
            await sleep(300 + Math.floor(Math.random() * 200));
        }

        if (!ids.length) {
            report("Nenhuma mensagem sua encontrada com esse filtro.");
            return;
        }

        report(`🧹 Apagando ${ids.length} mensagem(ns)… isso pode levar um tempo.`);

        // Phase 2 — delete, retrying failures a couple of times.
        let deleted = 0;
        let pending = ids;
        for (let attempt = 0; attempt < 3 && pending.length; attempt++) {
            const failed: string[] = [];
            for (const batch of chunk(pending, BLOCK)) {
                const results = await Promise.allSettled(
                    batch.map(id => RestAPI.del({ url: Constants.Endpoints.MESSAGE(channelId, id) }))
                );
                results.forEach((res, i) => {
                    if (res.status === "fulfilled" || isAlreadyGone((res as PromiseRejectedResult).reason)) deleted++;
                    else failed.push(batch[i]);
                });
                if (deleted % 25 === 0) showToast(`🧹 ${deleted}/${ids.length}…`);
                await sleep(DELAY + Math.floor(Math.random() * 400));
            }
            pending = failed;
            if (pending.length) await sleep(1000);
        }

        report(pending.length
            ? `Concluído com ${pending.length} falha(s). Apagadas: ${deleted}/${ids.length}.`
            : `✅ ${deleted} mensagem(ns) apagada(s).`);
    } catch (e) {
        report("❌ Erro ao limpar: " + (e instanceof Error ? e.message : String(e)));
    } finally {
        running = false;
    }
}

let unregister: (() => void) | undefined;

export default defineCorePlugin({
    manifest: {
        id: "pixelcord.messagecleaner",
        name: "MessageCleaner",
        version: "1.0.0",
        description: "Bulk-delete your own messages in the current chat with /clean [limit] [contains]. Violates Discord's ToS — use at your own risk.",
        authors: [{ name: "outlayer", id: "1499140821696647301" }]
    },
    start() {
        unregister = registerCommand({
            name: "clean",
            description: "Apaga suas próprias mensagens neste chat (ToS risk).",
            shouldHide: () => true,
            options: [
                {
                    name: "limit",
                    description: "Quantas mensagens no máximo (vazio = todas).",
                    type: ApplicationCommandOptionType.INTEGER
                },
                {
                    name: "contains",
                    description: "Só apaga mensagens que contêm este texto.",
                    type: ApplicationCommandOptionType.STRING
                }
            ],
            execute(args, ctx) {
                const limit = args.find(a => a.name === "limit")?.value;
                const contains = args.find(a => a.name === "contains")?.value;
                const report = (msg: string) => messageUtil.sendBotMessage(ctx.channel.id, msg);

                report("🔎 Procurando suas mensagens…");
                runClean(ctx.channel.id, report, {
                    limit: limit ? parseInt(String(limit), 10) : undefined,
                    contains: contains ? String(contains) : undefined
                });
            }
        });
    },
    stop() {
        unregister?.();
        unregister = undefined;
    }
});
