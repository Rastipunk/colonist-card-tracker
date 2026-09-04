# Chrome Web Store · textos de la ficha

Todo lo de este archivo se pega tal cual en el Developer Dashboard cuando llegue el momento.

## Nombre

Colonist Card Tracker

## Resumen (máx. 132 caracteres)

**ES:** Contador de cartas para colonist.io con probabilidades de robo, banco, desarrollo y dados. Graba partidas anónimas para investigación.

**EN:** Card counter for colonist.io with steal probabilities, bank, development cards and dice. Records anonymous games for research.

## Descripción

**ES**

Colonist Card Tracker muestra, mientras juegas en colonist.io, cuántas cartas de cada recurso tiene cada jugador.

• Cuenta cada reparto, construcción, intercambio, descarte y monopolio.
• Cuando un rival roba a otro rival y la carta no se ve, calcula la probabilidad de cada opción y la va afinando con las jugadas siguientes.
• Muestra el banco, las cartas de desarrollo en mano y jugadas, los puntos de victoria esperados y el histograma de dados.
• Verifica el conteo contra el total de cartas que envía el servidor y avisa si algo no cuadra.
• Funciona en cualquier idioma y sobrevive a una recarga a mitad de partida.

Investigación abierta. Esta extensión es gratuita. A cambio te pedimos, de forma totalmente opcional, permiso para guardar la historia de tus partidas (jugadas, intercambios y chat) de forma anónima: los nombres de todos los jugadores se sustituyen por códigos antes de que nada salga de tu navegador, y la clave que genera esos códigos nunca sale de tu instalación. Los datos se usan únicamente para investigar cómo se juega y se negocia en Catan y para entrenar agentes de juego. Puedes decir que no, o cambiar de opinión en cualquier momento, y el contador funciona igual.

Herramienta no oficial, sin relación con Colonist. Solo lee el tráfico que el servidor ya envía a tu navegador; no envía nada a Colonist ni modifica la partida.

**EN**

Colonist Card Tracker shows, while you play on colonist.io, how many cards of each resource every player holds.

• Counts every distribution, build, trade, discard and monopoly.
• When an opponent steals from another opponent and the card is hidden, it computes the probability of each option and refines it with later moves.
• Shows the bank, development cards in hand and played, expected victory points and the dice histogram.
• Checks the count against the card totals sent by the server and flags any mismatch.
• Works in any interface language and survives a page reload mid-game.

Open research. This extension is free. In return we ask, entirely optionally, for permission to store the history of your games (moves, trades and chat) anonymously: every player name is replaced by a code before anything leaves your browser, and the key that generates those codes never leaves your installation. The data is used only to study how people play and negotiate in Catan and to train game-playing agents. You can say no, or change your mind at any time, and the counter works the same.

Unofficial tool, not affiliated with Colonist. It only reads the traffic the server already sends to your browser; it sends nothing to Colonist and does not modify the game.

## Categoría

Productividad → Herramientas para desarrolladores no; usar **Juegos** (o "Fun").

## Idiomas

Español, Inglés.

## Capturas (1280×800 o 640×400, PNG/JPG, mínimo 1)

1. Partida real con el panel visible (recortar la captura de tu partida a 1280×800).
2. Página de Opciones con el consentimiento y la lista de partidas.

## Imagen promocional pequeña (440×280)

`store/promo-440x280.png` (generada; sustituir si se quiere algo más elaborado).

## Icono

`icons/icon128.png`

## Justificación de permisos (formulario "Prácticas de privacidad")

| Permiso | Justificación |
| --- | --- |
| `storage` | Guardar las preferencias del panel, el consentimiento del usuario y la cola de partidas pendientes de subir. |
| `alarms` | Reintentar periódicamente la subida de partidas pendientes cuando el servidor no estaba disponible. |
| Host `https://colonist.io/*` | La extensión solo funciona en colonist.io: lee los mensajes del juego que la propia página recibe para calcular el contador. |
| Content script en mundo MAIN | Necesario para observar los mensajes WebSocket del juego; no se modifican ni se envían mensajes. |

**Propósito único:** contador de cartas para colonist.io con grabación opcional de partidas anonimizadas para investigación.

**Datos que se recogen (marcar):** "Actividad del usuario" (jugadas e intercambios dentro del juego) y "Contenido del sitio web" (chat de la partida y estado del juego). Todo anonimizado y solo con consentimiento explícito.

**Certificaciones de uso limitado:** sí a las tres (no vender, no usar para fines ajenos al propósito único, no usar para solvencia crediticia ni préstamos).

**Uso de código remoto:** no.

**URL de la política de privacidad:** https://github.com/Rastipunk/colonist-card-tracker/blob/main/PRIVACY.md

## Notas para el revisor (campo opcional)

**EN:** The extension wraps `window.WebSocket` on colonist.io to read incoming game-state messages (msgpack) that the page already receives; it never sends or modifies messages. Recording of games is off until the user explicitly accepts the in-panel consent card, and all usernames/ids are pseudonymised client-side before upload (see `src/recorder/format.js`). Source code is public at https://github.com/Rastipunk/colonist-card-tracker. To test: open a game on colonist.io; the panel appears top-right. Options page lists any recorded games and allows export/delete.
