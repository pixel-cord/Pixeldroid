import { fetchApi } from "../../badges/lib/auth";
import { API_URL } from "../../badges/lib/constants";

// Same endpoints the desktop client uses, so connections sync PC <-> mobile.
// GET /api/connections?ids=[...]  -> { userId: { instagram: "name", ... } }  (public)
// GET/PUT /api/me/connections     -> { connections, hidden }                  (auth)

/** Map of platform id -> handle/username, e.g. { instagram: "someone" }. */
export type Connections = Record<string, string>;

/** The signed-in user's connections: values plus which platforms are hidden. */
export interface MyConnections {
    connections: Connections;
    hidden: string[];
}

export const getUsersConnections = async (ids: string[]): Promise<Record<string, Connections>> => {
    if (!ids.length) return {};
    return fetch(`${API_URL}/connections?ids=${encodeURIComponent(JSON.stringify(ids))}`).then(r => r.json());
};

export const getMyConnections = async (): Promise<MyConnections> =>
    fetchApi(`${API_URL}/me/connections`).then(r => r.json()).then(d => ({
        connections: d.connections ?? {},
        hidden: d.hidden ?? []
    }));

export const setMyConnections = async (connections: Connections, hidden: string[] = []): Promise<MyConnections> =>
    fetchApi(`${API_URL}/me/connections`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connections, hidden })
    }).then(r => r.json()).then(d => ({
        connections: d.connections ?? {},
        hidden: d.hidden ?? []
    }));
