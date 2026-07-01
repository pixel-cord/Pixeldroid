# Pixelcord — iOS

The iOS injector for Pixelcord. It's a tweak (fork of [BunnyTweak](https://github.com/bunny-mod/BunnyTweak) →
VendettaTweak) that loads the **same `pixelcord.min.js` bundle** the Android build uses into Discord's
React Native runtime. The plugins/JS are shared; only the injector is platform-specific.

## How it works
- On launch it fetches the bundle from
  `https://github.com/pixel-cord/Pixeldroid/releases/latest/download/pixelcord.min.js`
  (`Sources/Tweak.x`) and evaluates it in Discord's RN bridge.
- A **custom URL** can be set at runtime (recovery/settings) to point at any bundle — e.g. a local
  `http://<ip>:4040/pixelcord.js` for development.
- The loader exposes `globalThis.__PYON_LOADER__` (pyon loader contract), which the Revenge-based
  Pixelcord bundle expects.

## Try it with ZERO build (validate first)
Before building a branded app, confirm the bundle runs on this loader:
1. Install stock **Bunny iOS** (its AltStore/SideStore IPA, or `.deb` if jailbroken).
2. Settings → enable **custom URL** → paste
   `https://github.com/pixel-cord/Pixeldroid/releases/latest/download/pixelcord.min.js`.
3. Reload. If Pixelcord plugins/badges appear, the loader is compatible and the branded build below
   will "just work".

## Build (CI — no Mac needed on your side)
The build runs on a GitHub Actions **macOS** runner via `.github/workflows/ios.yml`:

1. Get a **decrypted Discord IPA** (from a decrypted-IPA source; Apple ships encrypted binaries).
2. Actions → **iOS Build** → Run workflow, with:
   - `ipa_url`: direct link to the decrypted Discord IPA
   - `release`: `true` to publish a GitHub release
3. It produces:
   - `br.com.pixelcord.ios_<ver>_iphoneos-arm64.deb` (jailbreak install)
   - `Pixelcord.ipa` (sideload)
   - updates `app-repo.json` (AltStore/SideStore source)

### Local build (optional)
Needs [theos](https://theos.dev) + `cyan`:
```sh
cd ios
make package                 # → packages/*.deb
# then inject into a decrypted Discord IPA:
cyan -duwsgq -n Pixelcord -i discord.ipa -o Pixelcord.ipa -f packages/*-arm64.deb
```

## Install (Apple realities)
| method | permanence | supported iOS |
|--------|------------|---------------|
| **TrollStore** (install the `.ipa`) | permanent | 14.0–16.6.1 / 17.0 (CoreTrust) |
| **AltStore / SideStore** (add `app-repo.json` as a source) | re-signs every 7 days (SideStore auto over Wi-Fi) | any |
| **Jailbreak** (`.deb`, needs Orion runtime from Chariz) | permanent | jailbroken |

## Maintenance
Discord ships new app versions → re-run the workflow with a fresh decrypted IPA. The **JS bundle is
shared with Android**, so plugin work carries over automatically; only the IPA repackaging repeats.

## Credits
Injector forked from BunnyTweak / VendettaTweak (see `LICENSE`). Internal symbols
(`__PYON_LOADER__`, `BunnyResources`, `pyoncord` dir) are kept for loader compatibility.
