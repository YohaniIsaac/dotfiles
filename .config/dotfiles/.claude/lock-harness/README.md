# Arnés para probar hyprlock sin bloquear la sesión real

Sirve para ver cómo queda una pantalla de bloqueo y para probar `hypr/scripts/lock.sh` sin
arriesgar nada: un hyprlock con la config rota puede dejar la sesión en "lockscreen app died", y
probarlo con el PAM real puede bloquear tu cuenta (ver "Por qué es así", punto 4). Lo escribió
Claude el 2026-10-01 al hacer la pantalla de bloqueo; no es parte del escritorio.

## Uso

```bash
cd ~/.config/dotfiles/.claude/lock-harness
./harness-up.sh                                           # compositor anidado oculto + salida virtual 1920x1080
./shot.sh ~/.config/hypr/hyprlock.conf /tmp/lock.png      # bloquea el anidado y guarda el fotograma; 3.er argumento: escala (1.25…)
./locktest.sh                                             # pruebas de lock.sh: bloquear, repetir, zombi, duplicados, re-bloquear
./harness-down.sh
```

- Estado en `$LOCK_HARNESS_DIR` (por defecto `$XDG_RUNTIME_DIR/lock-harness`): firma de la instancia,
  display, `dump.so` (se compila al levantar), fotogramas y logs.
- `SETTLE=4` espera más antes de volcar (imágenes pesadas); `EXTRA_ENV="PATH=…/stub:$PATH XDG_CACHE_HOME=…"`
  corre hyprlock con otro entorno (un `playerctl` falso, otra caché…); `KEEP=1` deja el bloqueo puesto
  (se suelta con `./unlock.sh`).
- Requiere `gcc` y las cabeceras de EGL/GLES (`/usr/include/EGL`, `/usr/include/GLES2`), `imagemagick`,
  `jq` y `faillock`. No hace falta `grim`.
- Con el campo de contraseña forzado a visible (para ver su aspecto): copia la config y pon
  `fade_on_empty = false`. No se puede teclear (no hay `wtype`), y **nunca** hay que probar una
  contraseña mala: ver el punto 4.

## Casos límite y presets de tipografía

- **Un preset sin tocar el activo:** `lock-font.sh <preset>` cambia el enlace REAL y el usuario puede
  bloquear en cualquier momento. Para ver un preset se genera una copia de la config con el `source` del
  preset cambiado y se pasa a `shot.sh`:
  `sed "s#^source = ~/.config/hypr/lock-font.conf#source = ~/.config/hypr/lock-fonts/sakoora.conf#" ~/.config/hypr/hyprlock.conf > $LOCK_HARNESS_DIR/cfg.conf`
- **Reproductor falso:** `EXTRA_ENV="PATH=$PWD/stub:$PATH STUB_MODE=<modo>"` con `none` (sin
  reproductor), `playing`, `long` (título y artista larguísimos), `amp` (`&`, `<`) o `acentos` (mayúsculas
  con tilde). Es `stub/playerctl`; los comandos de `lock-info.sh` lo encuentran porque hyprlock hereda el PATH.
- **Fecha fija:** `LOCK_INFO_NOW=$(date -d '2026-09-30 12:00' +%s)` en `EXTRA_ENV` da un miércoles con la
  fecha más larga (MIÉRCOLES, "30 de septiembre de 2026"): el peor caso de ancho y de tildes.
- **Prueba siempre con la salida real de los comandos.** Sustituir una etiqueta por texto fijo en la copia de
  la config no vale: `<br/>` se interpretaba en texto fijo y salía literal en un `cmd[...]` (llegó a la
  config viva unos minutos). Si hay que forzar un texto, que lo imprima un comando (`printf '…'`).
- Para ver el campo de contraseña, copia la config con `fade_on_empty = false`.

## Por qué es así (lo que costó descubrir)

1. **Hyprland no arranca solo sin DRM** (`CBackend::create() failed`; `--socket` además exige
   `--wayland-fd`). Hay que lanzarlo como ventana de la sesión real. `harness-up.sh` la manda a un
   workspace especial oculto (`[workspace special:lockharness silent]`), así que no se ve nada, y
   le crea una salida virtual (`hyprctl output create headless`) donde se renderiza fuera de
   pantalla. La salida de la ventana oculta no puede presentar fotogramas (no recibe frame
   callbacks) y retrasaba el bloqueo ~2 s: se desactiva.
2. **`grim` devuelve negro con la sesión bloqueada** (Hyprland no deja capturar la salida), aunque
   hyprlock esté dibujando. Por eso `dump.c` (`LD_PRELOAD`) intercepta `eglSwapBuffers` y vuelca el
   fotograma del propio hyprlock (`glReadPixels` antes del swap). Se validó con `egltest.c` (un
   cliente EGL mínimo que pinta #20a040: el píxel central tiene que salir 32,160,64,255). Para
   compilar ese cliente: `wayland-scanner client-header /usr/share/wayland-protocols/stable/xdg-shell/xdg-shell.xml xdg-shell-client-protocol.h`,
   `wayland-scanner private-code … xdg-shell-protocol.c` y
   `gcc egltest.c xdg-shell-protocol.c -o egltest -lwayland-client -lwayland-egl -lEGL -lGLESv2`.
   GTK4 no sirve de control: usa `eglSwapBuffersWithDamage` vía `eglGetProcAddress`.
3. Una escena estática casi no hace `eglSwapBuffers`: `shot.sh` añade a una copia de la config una
   etiqueta invisible que cambia cada 150 ms para forzar redibujados.
4. **PAM falso (imprescindible).** hyprlock abre una conversación PAM al bloquear; si el proceso
   termina con ella pendiente (SIGUSR1, `kill`…), `pam_faillock` lo cuenta como un login fallido del
   usuario real. Con 3 la cuenta queda bloqueada 10 min: también `sudo` y el desbloqueo real. Pasó
   en las primeras pruebas (2026-10-01 12:53–12:55; se arregló con `faillock --user yt --reset`).
   `dump.c` sustituye `pam_start`/`pam_authenticate`/`pam_end` (las tres que usa hyprlock) y
   `shot.sh`/`locktest.sh` se niegan a correr si no se aplica; además comparan `faillock` antes y
   después. Efecto secundario útil: con la conversación que no termina, hyprlock no sale tras
   desbloquear, igual que el zombi real, y se prueba el vigilante de `lock.sh`.
5. Las configs de prueba tienen que escribir los bloques en **varias líneas**: hyprlang no admite `;`
   y descarta el bloque entero sin avisar (hyprlock no dibuja nada: 1 `glClear` y 0 `glDrawArrays` por
   fotograma). Se perdió un buen rato por eso.
6. Todo se apaga por PID (`SIGUSR1` al hyprlock de pruebas, `dispatch exit` a la instancia anidada),
   nunca con `pkill hyprlock`: en la sesión real puede haber otro y no hay que tocarlo.

## Sin probar

Teclear en el campo (revelarlo, puntos, fallo de autenticación) y desbloquear con la contraseña
real: se comprueba a mano con el atajo de bloqueo. Varias salidas a la vez (se probó una salida a
escala 1 y 1,25, no tres a la vez).
