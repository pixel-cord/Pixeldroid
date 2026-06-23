import { fetchApi } from "../badges/lib/auth";
import { API_URL } from "../badges/lib/constants";

// Your hidden-badge list lives server-side (same endpoints the desktop uses), so
// changes here sync to PC and vice-versa.
export const getMyHidden = async (): Promise<string[]> =>
    fetchApi(`${API_URL}/me/hidden`).then(r => r.json()).then(d => d.hidden ?? []);

export const setMyHidden = async (hidden: string[]): Promise<string[]> =>
    fetchApi(`${API_URL}/me/hidden`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hidden })
    }).then(r => r.json()).then(d => d.hidden ?? []);
