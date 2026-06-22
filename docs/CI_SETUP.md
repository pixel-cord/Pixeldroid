# Pixelcord Mobile — Setup da CI e Release

Monorepo com as 3 peças do Pixelcord mobile (Android-first):

| Pasta | O que é | Vira |
|-------|---------|------|
| `core/` | Runtime + plugins + badges (TypeScript) | `pixelcord.min.js` |
| `loader/` | Instalador **sem root** (LSPatch) | `pixelcord-manager.apk` |
| `xposed/` | Módulo que injeta o bundle no Discord | `pixelcord-xposed.apk` |

O usuário final só baixa **`pixelcord-manager.apk`**. O Manager baixa o módulo + o Discord e gera um Discord modificado, tudo sem root.

---

## 1. Criar o repositório no GitHub

```bash
cd ~/pixelcord-mobile
git init
git add .
git commit -m "Pixelcord mobile: fork inicial do Revenge (core + loader + xposed)"
git branch -M main
git remote add origin git@github.com:pixel-cord/Pixeldroid.git
git push -u origin main
```

> As URLs no código já apontam pra `pixel-cord/Pixeldroid`. Se mudar o nome do repo, atualizar:
> - `xposed/.../UpdaterModule.kt` → `DEFAULT_BUNDLE_URL`
> - `loader/.../DownloadModStep.kt` → `downloadFullUrl`
> - `loader/.../HomeViewModel.kt` → `getLatestRelease(...)`
> - `loader/app/build.gradle.kts` → `REPO`

## 2. Gerar a keystore de assinatura (uma vez)

```bash
keytool -genkey -v -keystore pixelcord.jks \
  -alias pixelcord -keyalg RSA -keysize 2048 -validity 10000
```

Guarde a senha e o alias. **Nunca** commite o `.jks` (já está no `.gitignore`).

Gere o base64 pra colocar no secret:

```bash
base64 -w0 pixelcord.jks   # copie a saída
```

## 3. Adicionar os secrets no GitHub

Repo → **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Valor |
|--------|-------|
| `KEYSTORE` | o base64 do passo 2 |
| `KEYSTORE_PASSWORD` | senha da store |
| `KEYSTORE_ENTRY_ALIAS` | o alias (ex: `pixelcord`) |
| `KEYSTORE_ENTRY_PASSWORD` | senha da chave |

(`GITHUB_TOKEN` é automático, não precisa criar.)

## 4. Rodar o build

**Actions → Release → Run workflow** → informe a versão (ex: `1.0.0`).

Sai uma release `v1.0.0` com os 3 artefatos. A partir daí, o app se auto-atualiza puxando a `latest`.

---

## Notas / pontos a validar no 1º run

- **hermesc**: o core compila o bundle pra bytecode Hermes (mesmo com extensão `.js`). Na CI (ubuntu) o binário vem no pacote `react-native`. Se falhar por `hermesc` ausente, é o único ponto que pode precisar de ajuste.
- **Ícones**: o ícone do **Manager** já é o logo da Pixelcord. O ícone do **Discord modificado** (recolorido pelo `ReplaceIconStep`) ainda usa as cores antigas — ajustar depois em `loader/app/build.gradle.kts` (`MODDED_APP_ICON*`).
- **Convite**: `discord.gg/fsQUk9m5MS` já configurado no Manager e no core.
