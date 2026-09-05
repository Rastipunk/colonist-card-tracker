# Política de privacidad · Colonist Card Tracker

_English version below._

**Resumen en una frase:** toda la información que esta extensión guarda es anónima y se utiliza exclusivamente con fines de investigación sobre la toma de decisiones y la negociación en el juego.

## Qué hace la extensión

Muestra un contador de cartas mientras juegas en colonist.io. Para ello lee, dentro de tu navegador, los mensajes que el servidor de Colonist ya envía a la página. No modifica la partida, no envía nada a Colonist y no actúa en ninguna otra web.

## Grabación para investigación (requiere tu aceptación)

La primera vez que abres el panel se te pide aceptar la recogida anónima de datos; el contador solo se activa si aceptas. Al aceptar, la extensión guarda la historia de cada partida que juegas: jugadas, dados, intercambios, estado de la partida y mensajes del chat de la partida. La grabación se envía al servidor del proyecto cuando termina la partida. Puedes retirar el consentimiento en cualquier momento desde Opciones; en ese caso el contador queda desactivado y no se graba nada.

## Anonimización: qué sale de tu navegador y qué no

Antes de que una grabación salga de tu navegador:

- **Nombres de usuario.** El tuyo y el de todos los demás jugadores y espectadores se sustituyen por un código (por ejemplo `p_8a4538cf4992`). El código se calcula con una clave aleatoria que se genera en tu instalación y **nunca sale de ella**, de modo que ni el servidor ni nadie puede recuperar el nombre original a partir del código.
- **Identificadores.** Los identificadores de usuario y de sesión se sustituyen por códigos del mismo tipo.
- **Datos que se eliminan.** Avatares, fotos de perfil, correos, tokens de sesión y cualquier campo similar se borran.
- **Chat.** El texto de los mensajes se conserva porque forma parte de la investigación, pero cualquier mención al nombre de un jugador dentro del mensaje se sustituye por el mismo código que ese jugador tiene en la partida.

Lo que sí se conserva es la **estructura de la partida**: qué asiento (color) hizo cada jugada, escribió cada mensaje o ganó. Eso permite estudiar, por ejemplo, cómo negocian los jugadores que ganan frente a los que pierden, sin saber quiénes son.

Se guarda además un identificador de instalación aleatorio (no está ligado a tu cuenta de Colonist ni a tu dispositivo) que sirve para agrupar las partidas enviadas desde una misma instalación y para limitar abusos del servidor.

## Uso de los datos

Investigación sobre la toma de decisiones y la negociación en el juego. Los datos anonimizados pueden publicarse como conjunto de datos de investigación. No se venden, no se usan para publicidad y no se cruzan con ninguna otra fuente.

## Lo que no se recoge

Nada fuera de colonist.io. Ni historial de navegación, ni cookies, ni datos de tu cuenta de Colonist, ni tu dirección IP más allá de lo que cualquier servidor web registra de forma transitoria para funcionar.

## Tus derechos

- Puedes ver, exportar y borrar las copias locales desde Opciones.
- Puedes retirar el consentimiento en cualquier momento.
- Para solicitar la eliminación de las partidas ya enviadas, indica tu identificador de instalación (visible en Opciones) en el contacto del proyecto.

## Contacto

Abre un issue en https://github.com/Rastipunk/colonist-card-tracker/issues (el código de la extensión es público en ese mismo repositorio).

---

# Privacy policy · Colonist Card Tracker

**One-sentence summary:** everything this extension stores is anonymous and is used exclusively for research on decision-making and negotiation in the game.

## What the extension does

It shows a card counter while you play on colonist.io by reading, inside your browser, the messages the Colonist server already sends to the page. It does not modify the game, sends nothing to Colonist and does not run on any other website.

## Research recording (your acceptance is required)

The first time the panel opens you are asked to accept the anonymous data collection; the counter is only enabled if you accept. Once accepted, the extension stores the history of each game you play: moves, dice, trades, game state and in-game chat messages. The recording is uploaded to the project server when the game ends. You can withdraw consent at any time in Options; the counter is then disabled and nothing is recorded.

## Anonymisation: what leaves your browser and what does not

Before a recording leaves your browser:

- **Usernames.** Yours and every other player's and spectator's are replaced by a code (for example `p_8a4538cf4992`). The code is derived from a random key generated in your installation that **never leaves it**, so neither the server nor anyone else can recover the original name from the code.
- **Identifiers.** User and session identifiers are replaced by codes of the same kind.
- **Removed data.** Avatars, profile pictures, e-mails, session tokens and similar fields are deleted.
- **Chat.** Message text is kept because it is part of the research, but any mention of a player name inside a message is replaced by the same code that player has in the game.

What is preserved is the **structure of the game**: which seat (colour) made each move, wrote each message or won. That allows studying, for example, how winning players negotiate compared with losing ones, without knowing who they are.

A random installation identifier (not linked to your Colonist account or your device) is also kept to group games sent from the same installation and to limit abuse of the server.

## Use of the data

Research on decision-making and negotiation in the game. Anonymised data may be released as a research dataset. It is not sold, not used for advertising and not combined with any other source.

## Not collected

Anything outside colonist.io: no browsing history, no cookies, no Colonist account data, and no IP address beyond what any web server transiently logs in order to work.

## Your rights

- View, export and delete local copies from Options.
- Withdraw consent at any time.
- To request deletion of games already uploaded, send your installation identifier (shown in Options) to the project contact.

## Contact

Open an issue at https://github.com/Rastipunk/colonist-card-tracker/issues (the extension source code is public in that repository).
