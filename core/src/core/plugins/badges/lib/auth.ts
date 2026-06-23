import { createStorage } from "@lib/api/storage";
import { findByStoreName } from "@metro";

import { AUTHORIZE_URL, CLIENT_ID, loadApiConfig } from "./constants";

const UserStore = findByStoreName("UserStore");

// Tokens are stored per Discord account (you can be logged into more than one),
// exactly like the desktop store keys them by current user id.
interface AuthStorage {
    tokens: Record<string, string>;
}

export const authStorage = createStorage<AuthStorage>("plugins/pixelcord.badges/auth.json", {
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
    authStorage.tokens[id] = token;
}

export function clearToken() {
    const id = currentUserId();
    if (id && authStorage.tokens) delete authStorage.tokens[id];
}

// Build the Discord OAuth2 authorize URL. Mobile Discord intercepts this and
// shows its own native authorize screen; after approving it redirects to the
// backend (AUTHORIZE_URL), which returns the Pixelcord token. The user copies
// that token back into the app (see DonatePage). This avoids depending on a
// private Discord-internal OAuth modal component that drifts between versions.
export async function getAuthorizeUrl(): Promise<string | null> {
    if (!CLIENT_ID) await loadApiConfig();
    if (!CLIENT_ID) return null;

    const params = new URLSearchParams({
        client_id: CLIENT_ID,
        response_type: "code",
        scope: "identify",
        redirect_uri: AUTHORIZE_URL
    });
    return `https://discord.com/oauth2/authorize?${params.toString()}`;
}
