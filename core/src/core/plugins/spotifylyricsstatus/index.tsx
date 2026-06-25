import { createStorage, useObservable } from "@lib/api/storage";
import { logger } from "@lib/utils/logger";
import { findByProps, findByStoreName } from "@metro";
import { TableRow, TableRowGroup, Text as MText, TextInput } from "@metro/common/components";
import { ScrollView } from "react-native";

import { defineCorePlugin } from "..";

// SpotifyLyricsStatus (mobile). Port of the desktop Pixelcord plugin
// (src/equicordplugins/spotifyLyricsStatus). Syncs your Discord custom status
// with the lyrics of the song you're playing on Spotify, line by line, and
// clears the status when the song ends.
//
// Hook points (mined from real Vendetta/Revenge plugins, per our rule):
//   • Spotify now-playing: findByStoreName("SpotifyStore").getActivity()
//       → .sync_id (Spotify track id), .timestamps.start/.end (epoch ms).
//       Used by explysm/plugins autonote; scrobblers fall back to
//       SelfPresenceStore.findActivity(a => a.sync_id), which we use as a guard.
//   • Custom status: findByProps("updateRemoteSettings")
//       .updateRemoteSettings({ customStatus: { text, emojiName, ... } })
//       Same server-side path Discord's own settings UI uses.
//
// Position comes from the activity timestamps (start/end), not a websocket, so
// this works on mobile where there's no desktop-style SPOTIFY_PLAYER_STATE.

const LYRICS_API = "https://api.cee.bio/spotify/lyrics/";

interface SyncedLyric {
    time: number; // ms
    text: string | null; // null = instrumental / empty line
}

interface Settings {
    emoji: string;
    fallbackToTrackName: boolean;
    maxLength: number;
}

const storage = createStorage<Settings>("plugins/pixelcord.spotifylyricsstatus/settings.json", {
    dflt: { emoji: "🎵", fallbackToTrackName: true, maxLength: 128 }
});

export const preenabled = false;

// ── lazily-resolved modules ──────────────────────────────────────────
let SpotifyStore: any;
let SelfPresenceStore: any;
let UserSettingsActions: any;

function getSpotifyActivity(): any | null {
    try {
        const act = SpotifyStore?.getActivity?.();
        if (act?.sync_id) return act;
    } catch { /* fall through to presence */ }
    try {
        return SelfPresenceStore?.findActivity?.((a: any) => a?.sync_id) ?? null;
    } catch {
        return null;
    }
}

// ── live state ───────────────────────────────────────────────────────
let currentTrackId: string | null = null;
let currentDuration = 0; // ms
let trackStart = 0; // epoch ms
let trackEnd = 0; // epoch ms
let lastTrackName = "";

let lyrics: SyncedLyric[] | null = null;
let fetchToken = 0;

let lastSetText: string | null = null;
let lastUpdateAt = 0;
let hasOverridden = false;
let tickHandle: ReturnType<typeof setInterval> | undefined;

const TICK_MS = 500;
const MIN_UPDATE_INTERVAL = 1200; // don't hammer the settings sync

function toMs(v: number | string | undefined): number {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
}

async function fetchLyrics(trackId: string): Promise<SyncedLyric[] | null> {
    try {
        const res = await fetch(LYRICS_API + trackId);
        if (!res.ok) return null;

        const json = await res.json();
        const lines = json?.data?.lines;
        if (!Array.isArray(lines) || lines.length < 2) return null;

        const parsed: SyncedLyric[] = lines
            .map((l: any) => {
                const words = String(l.words ?? "").trim();
                return {
                    time: Number(l.startTimeMs),
                    text: words === "" || words === "♪" ? null : words
                };
            })
            .filter((l: SyncedLyric) => Number.isFinite(l.time));

        return parsed.length >= 2 ? parsed : null;
    } catch (e) {
        logger.error("[SpotifyLyricsStatus] failed to fetch lyrics", e);
        return null;
    }
}

function truncate(text: string): string {
    const max = Math.min(storage.maxLength || 128, 128);
    return text.length > max ? text.slice(0, max - 1) + "…" : text;
}

function applyStatus(text: string) {
    if (text === lastSetText) return;
    lastSetText = text;
    hasOverridden = true;
    try {
        UserSettingsActions?.updateRemoteSettings?.({
            customStatus: {
                text,
                emojiName: text ? storage.emoji || null : null,
                emojiId: null,
                expiresAtMs: null
            }
        });
    } catch (e) {
        logger.error("[SpotifyLyricsStatus] failed to set status", e);
    }
}

function clearStatus() {
    if (!hasOverridden) return;
    lastSetText = null;
    hasOverridden = false;
    try {
        UserSettingsActions?.updateRemoteSettings?.({
            customStatus: { text: null, emojiName: null, emojiId: null, expiresAtMs: null }
        });
    } catch (e) {
        logger.error("[SpotifyLyricsStatus] failed to clear status", e);
    }
}

function findCurrentLine(pos: number): SyncedLyric | null {
    if (!lyrics) return null;
    let current: SyncedLyric | null = null;
    for (const line of lyrics) {
        if (line.time <= pos) current = line;
        else break;
    }
    return current;
}

function tick() {
    const activity = getSpotifyActivity();

    // nothing playing → status back to nothing
    if (!activity) {
        currentTrackId = null;
        lyrics = null;
        clearStatus();
        return;
    }

    const trackId = String(activity.sync_id);

    // new song → reset and fetch its lyrics
    if (trackId !== currentTrackId) {
        currentTrackId = trackId;
        lyrics = null;
        lastSetText = null;
        trackStart = toMs(activity.timestamps?.start);
        trackEnd = toMs(activity.timestamps?.end);
        currentDuration = trackEnd > trackStart ? trackEnd - trackStart : 0;
        lastTrackName = [activity.details, activity.state].filter(Boolean).join(" — ");

        const token = ++fetchToken;
        fetchLyrics(trackId).then(fetched => {
            if (token === fetchToken) lyrics = fetched;
        });
    }

    const now = Date.now();
    const pos = trackStart ? now - trackStart : 0;

    // song finished (the activity usually vanishes, this is the safety net)
    if (trackEnd && now >= trackEnd - 250) {
        clearStatus();
        return;
    }

    // no synced lyrics for this song
    if (!lyrics) {
        if (storage.fallbackToTrackName && lastTrackName) {
            if (now - lastUpdateAt >= MIN_UPDATE_INTERVAL || lastSetText === null) {
                lastUpdateAt = now;
                applyStatus(truncate(lastTrackName));
            }
        } else {
            clearStatus();
        }
        return;
    }

    const line = findCurrentLine(pos);
    const text = line?.text ?? null;

    // before the first lyric / instrumental gap
    if (text === null) {
        if (lastSetText === null && storage.fallbackToTrackName && lastTrackName)
            applyStatus(truncate(lastTrackName));
        return;
    }

    if (now - lastUpdateAt < MIN_UPDATE_INTERVAL && truncate(text) !== lastSetText) return;

    lastUpdateAt = now;
    applyStatus(truncate(text));
}

function SettingsComponent() {
    useObservable([storage]);
    return (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingVertical: 16, gap: 16 }}>
            <MText variant="text-md/normal" color="text-muted" style={{ paddingHorizontal: 16 }}>
                Sincroniza o seu status personalizado com a letra da música que você está ouvindo no Spotify,
                linha por linha. Quando a música acaba, o status fica vazio até começar outra. Conecte o
                Spotify e ative "Exibir como status".
            </MText>
            <TableRowGroup title="Opções">
                <TableRow
                    label="Emoji"
                    subLabel="Emoji mostrado antes da letra (deixe vazio para nenhum)"
                    trailing={
                        <TextInput
                            value={storage.emoji}
                            onChange={(v: string) => {
                                storage.emoji = v;
                            }}
                            style={{ minWidth: 60, textAlign: "center" }}
                        />
                    }
                />
                <TableRow
                    label="Nome da música quando não há letra"
                    subLabel='Mostra "Música — Artista" quando a faixa não tem letra sincronizada'
                    trailing={
                        <MText
                            variant="text-md/semibold"
                            color="text-brand"
                            onPress={() => {
                                storage.fallbackToTrackName = !storage.fallbackToTrackName;
                            }}
                        >
                            {storage.fallbackToTrackName ? "Sim ✓" : "Não"}
                        </MText>
                    }
                />
            </TableRowGroup>
        </ScrollView>
    );
}

export default defineCorePlugin({
    manifest: {
        id: "pixelcord.spotifylyricsstatus",
        name: "SpotifyLyricsStatus",
        version: "1.0.0",
        description: "Sincroniza o status com a letra da música do Spotify em tempo real; limpa quando a música acaba.",
        authors: [{ name: "Crynew", id: "0" }]
    },
    SettingsComponent,
    start() {
        SpotifyStore = findByStoreName("SpotifyStore");
        SelfPresenceStore = findByStoreName("SelfPresenceStore");
        UserSettingsActions = findByProps("updateRemoteSettings");

        if (!UserSettingsActions?.updateRemoteSettings) {
            logger.error("[SpotifyLyricsStatus] updateRemoteSettings not found — cannot set status");
            return;
        }

        hasOverridden = false;
        lastSetText = null;
        currentTrackId = null;
        tickHandle = setInterval(tick, TICK_MS);
    },
    stop() {
        if (tickHandle) clearInterval(tickHandle);
        tickHandle = undefined;
        clearStatus();
        currentTrackId = null;
        lyrics = null;
    }
});
