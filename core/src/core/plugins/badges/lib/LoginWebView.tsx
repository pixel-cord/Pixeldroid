import { Text } from "@metro/common/components";
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { WebView } from "react-native-webview";

import { getAuthorizeUrl, setToken } from "./auth";

// In-app Discord OAuth: load the authorize URL in a WebView; when Discord
// redirects to the backend (/api/authorize?code=…) the backend responds with the
// bearer token as PLAIN TEXT, so we read document.body.innerText and post it back
// — the token is captured automatically, never shown or pasted by the user.
const INJECT = `(function(){try{if(location.href.indexOf('/api/authorize')>-1){var t=((document.body&&document.body.innerText)||'').trim();if(t)window.ReactNativeWebView.postMessage(t);}}catch(e){}})();true;`;

// Backend tokens are 40 alphanumeric chars — used to reject error/HTML pages.
const TOKEN_RE = /^[A-Za-z0-9]{24,80}$/;

export default function LoginWebView({ onDone }: { onDone: () => void }) {
    const [uri, setUri] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        getAuthorizeUrl().then(u => (u ? setUri(u) : setError("Não consegui falar com a API do Pixelcord.")));
    }, []);

    if (error) {
        return (
            <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 24 }}>
                <Text variant="text-md/medium" color="text-danger">{error}</Text>
            </View>
        );
    }

    if (!uri) {
        return (
            <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
                <ActivityIndicator size="large" />
            </View>
        );
    }

    return (
        <WebView
            source={{ uri }}
            injectedJavaScript={INJECT}
            onMessage={(e: any) => {
                const data = String(e?.nativeEvent?.data ?? "").trim();
                if (TOKEN_RE.test(data)) {
                    setToken(data);
                    onDone();
                }
            }}
            style={{ flex: 1, backgroundColor: "#000" }}
        />
    );
}
