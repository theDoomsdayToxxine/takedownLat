# Medical Deathmatch — Studio Edition v5.0.0

Un juego de trivia médica P2P por turnos con estética dark-fantasy retro inspirada en la era PS1 y en la composición visual desarrollada para Medical Deathmatch.

## Incluye
- 650 preguntas totales: 150 legado + 500 preguntas adicionales originales MIR-style.
- 4 opciones por pregunta; el orden de las opciones se baraja independientemente en cada presentación.
- Fisher–Yates sobre el banco completo de 650.
- Host-authoritative: el cliente envía el índice elegido y el host valida la respuesta.
- Turnos, temporizador de 30 s, daño, rachas y Modo Bestia ×2.
- Rematch sin recargar la ventana ni cerrar deliberadamente el canal P2P.
- Historial de las últimas 10 partidas de la misma sala y racha de victorias por sala.
- Bibliografía/URL de la pregunta disponible al resolver una pregunta errada y en el cierre de la partida cuando existe.
- Seis héroes con siluetas y armas propias.
- Paquete Electron para Windows, macOS y Linux.

## Ejecución web local
Sirve el directorio con cualquier servidor HTTP y abre `index.html`.

## App de escritorio
En un entorno Node compatible:

```bash
npm install
npm run start
```

Build:

```bash
npm run dist:win
npm run dist:linux
npm run dist:mac
```

## P2P
PeerJS se utiliza para señalización/conexión. Se necesita Internet para PeerJS. La partida intenta mantener el tráfico de estado entre los dos jugadores mediante el canal P2P.

## Preguntas y bibliografía
Las 500 preguntas nuevas son contenido original generado para el proyecto; no son una reproducción literal de bancos comerciales protegidos. Las URLs bibliográficas apuntan a organizaciones y guías de referencia. Debe existir revisión médica humana antes de uso docente/acreditado o comercial.

## QA
Ejecuta `node tests/qa_25_games.mjs` después de `npm install` y `npm run start` para validar el motor. La prueba lógica no sustituye una prueba E2E entre dos PCs físicos a través de Internet.

## Para el usuario de Windows
Si ya descargaste un release compilado, ejecuta el instalador. Si estás construyendo desde GitHub, usa el workflow `Build Desktop` y descarga `Medical-Deathmatch-Windows` en Artifacts.
