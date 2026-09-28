# Maré de Luz

Jogo 3D em primeira pessoa ambientado em uma praia. O celular funciona como sabre: a inclinação posiciona a lâmina e um movimento rápido dispara o corte. As criaturas avançam em ondas, e o golpe acerta somente quando a trajetória cruza uma criatura próxima.

## Iniciar

Requer Node.js 20 ou mais recente e OpenSSL.

```bash
npm install
npm start
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

## Verificação

```bash
npm run build
```

O comando compila as duas páginas. Para uma prévia HTTP **somente no computador**, use `npm run dev:http` e abra `http://127.0.0.1:5174/`. Essa prévia não permite o acesso ao controle pelos sensores do celular.
