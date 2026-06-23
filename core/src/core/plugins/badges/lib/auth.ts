import { createStorage } from "@lib/api/storage";
import { findByStoreName } from "@metro";

import { API_URL } from "./constants";

// Shared Pixelcord account auth, used by badges/hideBadges/moreConnections/donate.
// Login is browser + paste: open the Discord OAuth url, the backend's
// /api/authorize returns the bearer token as PLAIN TEXT in the browser, the user
// copies it back into the app. The token (and thus all account data — hidden
// badges, connections…) lives server-side, so it stays in sync with desktop.

const UserStore = findByStoreName("UserStore");

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
