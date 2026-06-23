import { createStorage } from "@lib/api/storage";
import { findByProps, findByStoreName } from "@metro";

import { API_URL } from "./constants";

// Shared Pixelcord account auth, used by badges/hideBadges/moreConnections/donate.
// Login is fully native (loginWithDiscord): since Pixeldroid runs INSIDE Discord,
// we authorize our OAuth app with the user's already-logged-in session via the
// Discord REST client — exactly like the desktop OAuth2AuthorizeModal does under
// the hood — then exchange the code for our bearer token. One tap, nothing to
// copy/paste. The token (and thus all account data — hidden badges, connections…)
// lives server-side, so it stays in sync with desktop.

const UserStore = findByStoreName("UserStore");
// Discord's authenticated REST client (same one MessageCleaner uses for get/del).
const RestAPI = findByProps("getAPIBaseURL", "post");

interface AuthStorage {
    tokens: Record<string, string>;
}
export const authStorage = createStorage<AuthStorage>("plugins/pixelcord.account/auth.json", {
    dflt: { tokens: {} }
});

function currentUserId(): string | undefined {
    try {
        return UserStore.getCurrentUser()?.id;
    } catch {
        return undefined;
    }
}

export function getToken(): string | null {
    const id = currentUserId();
    try {
        return id ? authStorage.tokens?.[id] ?? null : null;
    } catch {
        return null;
    }
}

export function setToken(token: string) {
    const id = currentUserId();
    if (!id) return;
    authStorage.tokens ??= {};
    authStorage.tokens[id] = token.trim();
}

export function clearToken() {
    const id = currentUserId();
    if (id && authStorage.tokens) delete authStorage.tokens[id];
}

export function isAuthed(): boolean {
    return !!getToken();
}

let CLIENT_ID = "";
let REDIRECT_URI = `${API_URL}/authorize`;

export async function loadConfig() {
    try {
        const c = await fetch(`${API_URL}/config`).then(r => r.json());
        if (c.clientId) CLIENT_ID = c.clientId;
        if (c.redirectUri) REDIRECT_URI = c.redirectUri;
    } catch {
        // backend unreachable; surfaced when the user tries to authorize
    }
}

// Native one-tap login: authorize our OAuth app using the user's logged-in
// Discord session, then exchange the returned code for our bearer token. No
// browser, no webview, no copy/paste. Needs no backend change.
export async function loginWithDiscord(): Promise<void> {
    if (!CLIENT_ID) await loadConfig();
    if (!CLIENT_ID) throw new Error("Não consegui falar com a API do Pixelcord.");
    if (!RestAPI?.post) throw new Error("Cliente HTTP do Discord indisponível.");

    // POST /oauth2/authorize with the user's session → Discord returns a redirect
    // location pointing at our backend with ?code=… (this is what clicking
    // "Authorize" in the native modal does).
    const res = await RestAPI.post({
        url: "/oauth2/authorize",
        query: {
            client_id: CLIENT_ID,
            response_type: "code",
            scope: "identify",
            redirect_uri: REDIRECT_URI
        },
        body: { permissions: "0", authorize: true }
    });

    const location: string | undefined = res?.body?.location;
    if (!location) throw new Error("O Discord não retornou a autorização.");

    // The backend /api/authorize?code=… exchanges the code for our token
    // (JSON when we ask for it; plain text otherwise).
    const tokenRes = await fetch(location, { headers: { Accept: "application/json" } });
    const text = (await tokenRes.text()).trim();
    if (!tokenRes.ok) throw new Error(text || `HTTP ${tokenRes.status}`);

    let token = text;
    if (text.startsWith("{")) {
        const j = JSON.parse(text);
        if (!j.token) throw new Error(j.message || "Resposta sem token.");
        token = j.token;
    }
    if (!/^[A-Za-z0-9]{16,}$/.test(token)) throw new Error("Token inválido recebido.");
    setToken(token);
}

export async function getAuthorizeUrl(): Promise<string | null> {
    if (!CLIENT_ID) await loadConfig();
    if (!CLIENT_ID) return null;
    const p = new URLSearchParams({
        client_id: CLIENT_ID,
        response_type: "code",
        scope: "identify",
        redirect_uri: REDIRECT_URI
    });
    return `https://discord.com/oauth2/authorize?${p.toString()}`;
}

export async function fetchApi(url: string, options: RequestInit = {}): Promise<Response> {
    const token = getToken();
    const res = await fetch(url, {
        ...options,
        headers: { ...options.headers, Authorization: `Bearer ${token}` }
    });
    if (res.ok) return res;
    if (res.status === 401) clearToken();
    throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
}
