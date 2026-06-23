import { findByProps, findByStoreName } from "@metro";

// Scan + delete engine for MessageCleaner. Ported from the desktop plugin but
// trimmed for mobile: a single in-flight job with progress callbacks instead of
// the per-channel zustand queue.

const RestAPI = findByProps("getAPIBaseURL", "get", "del");
const Constants = findByProps("Endpoints");
const UserStore = findByStoreName("UserStore");

export interface CleanFilters {
    has: string[];        // image / video / file / sound / embed / link — empty = all
    contains: string;     // substring filter (optional)
    limit: number | null; // max messages, null = all
    delay: number;        // ms between delete batches
}

export type CleanPhase = "scanning" | "deleting" | "done" | "error" | "cancelled";

export interface CleanProgress {
    phase: CleanPhase;
    found: number;
    deleted: number;
    total: number;
    error?: string;
}

export interface CleanHooks {
    onUpdate: (p: CleanProgress) => void;
    isCancelled: () => boolean;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function chunk<T>(arr: T[], n: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
    return out;
}

function isAlreadyGone(reason: any): boolean {
    return reason?.status === 404 || reason?.body?.code === 10008;
}

export function matchesFilters(msg: any, has: string[], contains: string): boolean {
    const c = contains.trim().toLowerCase();
    if (c && !(msg.content ?? "").toLowerCase().includes(c)) return false;
    if (!has.length) return true;

    const attachments: any[] = msg.attachments ?? [];
    const embeds: any[] = msg.embeds ?? [];

    const isImage = (a: any) => (a.content_type ?? "").startsWith("image") || /\.(png|jpe?g|gif|webp|bmp)$/i.test(a.filename ?? "");
    const isVideo = (a: any) => (a.content_type ?? "").startsWith("video") || /\.(mp4|webm|mov|mkv|m4v)$/i.test(a.filename ?? "");
    const isAudio = (a: any) => (a.content_type ?? "").startsWith("audio") || /\.(mp3|ogg|wav|m4a|flac)$/i.test(a.filename ?? "");

    const present: Record<string, boolean> = {
        image: attachments.some(isImage) || embeds.some(e => e.type === "image" || e.image),
        video: attachments.some(isVideo) || embeds.some(e => e.type === "video" || e.video),
        file: attachments.some(a => !isImage(a) && !isVideo(a) && !isAudio(a)),
        sound: attachments.some(isAudio),
        embed: embeds.length > 0,
        link: /https?:\/\/\S+/.test(msg.content ?? "")
    };

    return has.some(h => present[h]);
}

export function engineReady(): boolean {
    return !!(RestAPI && Constants?.Endpoints);
}

let busy = false;
export const isBusy = () => busy;

export async function runClean(channelId: string, filters: CleanFilters, hooks: CleanHooks) {
    if (busy) return;
    busy = true;

    const update = (p: Partial<CleanProgress> & { phase: CleanPhase; }) =>
        hooks.onUpdate({ found: 0, deleted: 0, total: 0, ...p });

    try {
        const me = UserStore.getCurrentUser()?.id;
        const limit = filters.limit && filters.limit > 0 ? filters.limit : Infinity;

        // Phase 1 — scan and collect ids of our matching messages.
        const ids: string[] = [];
        let before: string | undefined;
        while (ids.length < limit) {
            if (hooks.isCancelled()) { update({ phase: "cancelled", found: ids.length }); return; }

            const query: Record<string, any> = { limit: 100 };
            if (before) query.before = before;

            const res = await RestAPI.get({ url: Constants.Endpoints.MESSAGES(channelId), query });
            const page: any[] = res.body ?? [];
            if (!page.length) break;

            before = page[page.length - 1].id;
            for (const m of page) {
                if (m.author?.id === me && matchesFilters(m, filters.has, filters.contains)) {
                    ids.push(m.id);
                    if (ids.length >= limit) break;
                }
            }
            update({ phase: "scanning", found: ids.length });
            if (page.length < 100) break;
            await sleep(280 + Math.floor(Math.random() * 200));
        }

        if (!ids.length) { update({ phase: "done", found: 0, total: 0, deleted: 0 }); return; }

        // Phase 2 — delete, retrying failures a couple of times.
        let deleted = 0;
        let pending = ids;
        const total = ids.length;
        update({ phase: "deleting", found: total, total, deleted });

        for (let attempt = 0; attempt < 3 && pending.length; attempt++) {
            const failed: string[] = [];
            for (const batch of chunk(pending, 1)) {
                if (hooks.isCancelled()) { update({ phase: "cancelled", found: total, total, deleted }); return; }

                const results = await Promise.allSettled(
                    batch.map(id => RestAPI.del({ url: Constants.Endpoints.MESSAGE(channelId, id) }))
                );
                results.forEach((res, i) => {
                    if (res.status === "fulfilled" || isAlreadyGone((res as PromiseRejectedResult).reason)) deleted++;
                    else failed.push(batch[i]);
                });
                update({ phase: "deleting", found: total, total, deleted });
                await sleep(filters.delay + Math.floor(Math.random() * 400));
            }
            pending = failed;
            if (pending.length) await sleep(1000);
        }

        if (pending.length) update({ phase: "error", found: total, total, deleted, error: `${pending.length} não puderam ser apagadas` });
        else update({ phase: "done", found: total, total, deleted });
    } catch (e) {
        hooks.onUpdate({ phase: "error", found: 0, total: 0, deleted: 0, error: e instanceof Error ? e.message : String(e) });
    } finally {
        busy = false;
    }
}
