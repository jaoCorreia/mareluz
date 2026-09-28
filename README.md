# Maré de Luz

Jogo 3D em primeira pessoa ambientado em uma praia. O celular funciona como sabre: a inclinação posiciona a lâmina e um movimento rápido dispara o corte. As criaturas avançam em ondas, e o golpe acerta somente quando a trajetória cruza uma criatura próxima.

## Iniciar

Requer Node.js 22.12 ou mais recente. OpenSSL é usado somente no HTTPS local.

```bash
npm install
npm run dev
```

Abra o endereço `https://localhost:5173/` no computador. O servidor também mostra o endereço da rede local. Mantenha computador e celular na mesma rede Wi-Fi, leia o QR code na tela do jogo e toque em **Conectar sabre** no celular. Aceite o acesso aos sensores. Segure o celular na posição inicial e use **Recalibrar posição** quando quiser redefini-la.

O servidor gera um certificado HTTPS local em `.local/`. O navegador pode pedir que você confie nesse certificado no computador e no celular. A conexão HTTPS é necessária porque os navegadores liberam sensores de movimento somente em contextos seguros. Se o certificado não for aceito pelo navegador do celular, use um certificado local confiável ou publique o jogo em um host HTTPS de sua confiança.

## Controles

| Ação | Computador | Celular conectado |
|---|---|---|
| Posicionar sabre | Mover o mouse | Inclinar o celular |
| Cortar | Clique, barra de espaço ou movimento rápido do mouse | Movimento rápido do celular |
| Caminhar | W A S D | W A S D no computador |
| Girar a câmera | Q / E ou botão direito + mouse | Q / E no computador |
| Correr | Shift | Shift no computador |

O controle por mouse também permite jogar sem celular. Se o navegador do celular não fornecer dados do giroscópio, a página oferece um quadro de controle por toque. A página do celular recebe vibração de acerto ou dano quando o aparelho e o navegador oferecem esse recurso.

## Precisão do controle

Segure o celular na posição em que pretende jogar e mantenha-o parado por meio segundo até aparecer **Pronto**. A calibração usa várias leituras estáveis. Ela reinicia se o aparelho se mover durante esse intervalo, ao girar a tela ou ao voltar para a página.

Use **Sensibilidade** para ajustar quanto a lâmina se move e **Estabilidade** para suavizar tremores. O filtro responde mais rápido durante movimentos maiores. Uma mudança nesses ajustes ou uma recalibração nunca dispara um corte.

A ponta da lâmina e o círculo de mira indicam o ponto usado para acertar. Cruze o corpo da criatura com esse ponto em um movimento rápido. Os cortes seguem os trechos reais da trajetória; cada criatura recebe no máximo um acerto por passada. Interrupções e perdas de amostras quebram a trajetória para evitar golpes involuntários.

A orientação é calculada com rotações relativas nos três eixos conforme a [especificação Device Orientation](https://www.w3.org/TR/orientation-event/). Isso controla a inclinação do sabre; não mede a posição física do celular no espaço.

## Verificação

```bash
npm test
npm run build
```

Os testes cobrem calibração, ruído, frequências de leitura, interrupções, trajetória dos cortes e alinhamento da lâmina. O build compila as duas páginas. Para uma prévia HTTP **somente no computador**, use `npm run dev:http` e abra `http://127.0.0.1:5174/`. Essa prévia não permite o acesso ao controle pelos sensores do celular.

## Produção / Railway

```bash
npm ci
npm run build
npm start
```

O servidor Node entrega as duas páginas e o WebSocket `/relay` na porta `PORT` (8080 por padrão), em `0.0.0.0`. `/health` confirma que está ativo. O build não gera certificados locais.

No Railway, use uma réplica, build `npm run build`, start `npm start` e healthcheck `/health`. Configure `PUBLIC_ORIGIN` com a URL HTTPS pública, sem barra final (ou use o domínio gerado em `RAILWAY_PUBLIC_DOMAIN`). O Railway termina o TLS e encaminha HTTP/WebSocket ao servidor. O QR code usa essa mesma URL; computador e celular podem estar em redes diferentes.

As salas vivem na memória e são apagadas quando o serviço reinicia. Após um deploy, reabra o controle e conecte novamente. Use o QR code/código apenas com quem deve controlar a partida.
