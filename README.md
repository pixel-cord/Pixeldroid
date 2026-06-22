# Pixelcord Mobile

Versão mobile do [Pixelcord](https://github.com/pixel-cord/Pixelcord) (mod do Discord), **Android-first**, no estilo Bunny/Enmity. Fork da linhagem Vendetta → Bunny → **Revenge**, rebrandado pra Pixelcord.

> O Discord mobile é React Native (não Electron como o desktop). Por isso os plugins do desktop **não** são portados direto — são reescritos pro ambiente RN.

## Estrutura (monorepo)

```
core/     runtime + plugins + badges (TypeScript)  → pixelcord.min.js
loader/   instalador SEM ROOT via LSPatch (Kotlin)  → pixelcord-manager.apk
xposed/   módulo injetor do bundle (Kotlin)         → pixelcord-xposed.apk
```

Fluxo: **core** publica o bundle → **xposed** carrega ele dentro do Discord → **manager** baixa o módulo e repatcha o Discord (sem root).

## Build / Release

Tudo via GitHub Actions. Veja **[docs/CI_SETUP.md](docs/CI_SETUP.md)**.

## Instalação (usuário final)

Baixe o **`pixelcord-manager.apk`** da [última release](https://github.com/pixel-cord/Pixeldroid/releases/latest), instale, e use o Manager pra instalar o Pixelcord. Sem root.

## Comunidade

[Discord](https://discord.gg/fsQUk9m5MS)
