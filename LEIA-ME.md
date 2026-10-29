# Meu Painel — Samsung UN43DU7700 (Tizen 8)

Um painel preto e verde neon com 4 apps (Globoplay, YouTube, Netflix e Prime), 5 canais de TV aberta
e a previsão do tempo de Nossa Senhora do Socorro/SE.
Ele roda dentro do **TizenBrew**, um carregador de módulos da comunidade.

## Antes de começar

- Um PC com Windows na mesma rede Wi-Fi da TV
- Uma conta Samsung (a mesma da TV serve)
- Uma conta no GitHub, que é gratuita
- Uns 30 a 40 minutos

## Passo 1 — Publicar o painel no GitHub

1. Crie um repositório **público** chamado `painel-tv` em github.com/new.
2. Clique em **Add file > Upload files** e arraste **todo o conteúdo** desta pasta: `package.json`, `app/` e `service/`.
3. Clique em **Commit changes**.

Seu módulo vai se chamar `gh/SEU-USUARIO/painel-tv`.

## Passo 2 — Ativar o Modo Desenvolvedor na TV

1. Descubra o IP do PC: no Windows, abra o *Prompt de Comando*, digite `ipconfig` e veja o *Endereço IPv4*.
2. Na TV, abra **Apps** e digite **1 2 3 4 5** no controle. Se o controle não tiver números, use o teclado da tela.
3. Ligue **Modo Desenvolvedor**, digite o IP do PC em **IP do Host** e confirme com OK.
4. Desligue a TV **da tomada** por 30 segundos e ligue de novo.

## Passo 3 — Instalar o TizenBrew

1. No PC, baixe o **TizenBrew Installer** em github.com/reisxd/TizenBrewInstaller, na seção *Releases*.
2. Abra o programa, conecte à TV e clique em **Install TizenBrew**.
3. A sua TV é de 2024 (Tizen 8), então o programa vai pedir login na **conta Samsung** para criar um certificado. Siga as telas até o fim.
4. **Volte ao Modo Desenvolvedor da TV** (Apps > 12345) e troque o IP do Host para `127.0.0.1`.
   Sem isso, os módulos do TizenBrew não iniciam.

## Passo 4 — Adicionar o painel

1. Abra o **TizenBrew** na TV.
2. Vá em **Module Manager > Add module**, digite `gh/SEU-USUARIO/painel-tv` e confirme.
3. Abra **Meu Painel** na lista de módulos.
4. Na primeira vez que você escolher um **canal**, a TV vai perguntar se permite "Meu Painel". Escolha **Permitir**.

## Passo 5 — Fazer a TV ligar direto no painel

1. No TizenBrew, defina **Meu Painel** como módulo de *autolaunch* (inicialização).
2. Na TV, vá em **Configurações > Geral > Opções da tela inicial** (o nome pode variar) e ligue **Executar último app automaticamente**.
3. Na barra da Samsung, coloque o TizenBrew como **primeiro app**. Assim, depois de apertar Home, você volta ao painel com um clique.

## Como mudar apps e canais

Edite apenas o arquivo `app/config.js` direto no GitHub (ícone de lápis) e salve.
Depois feche e abra o painel de novo.

- **Canal:** troque o `numero` pelo número da sua lista (Menu > Canais).
  Para subcanal, use ponto, por exemplo `"4.1"`.
- **App:** adicione uma linha com `nome` e `busca` (um trecho do nome do app como aparece na TV).

## Imagens de fundo

As imagens ficam na pasta `app/img` e se alternam em loop a cada 12 segundos, com transição suave.
Para trocar ou adicionar imagens, envie JPGs de 1920x1080 com até uns 400 KB para `app/img` e liste os nomes em `fundos`, no `config.js`.
O tempo de cada imagem fica em `intervaloFundo`.

## Previsão do tempo

Os dados vêm do Open-Meteo, que é gratuito e não precisa de cadastro. O painel atualiza a cada 30 minutos e, se a internet cair, mostra a última previsão salva.
Para trocar a cidade, mude `latitude` e `longitude` em `CONFIG.tempo`, no arquivo `app/config.js`.

## Limites

- O botão **Home** do controle continua abrindo a tela da Samsung. Em 2024, o firmware não deixa trocar isso sem root.
- Uma **atualização de firmware** pode desligar o Modo Desenvolvedor. Nesse caso, refaça os passos 2 e 4.
- A troca de canal "digita" o número usando o controle virtual da TV e leva uns 3 segundos.
- Para remover, tire o módulo no TizenBrew e desinstale o TizenBrew como qualquer app. Nada da Samsung é alterado.
