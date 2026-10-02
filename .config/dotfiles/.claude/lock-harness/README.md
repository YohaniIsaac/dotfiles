# Arnés para probar hyprlock sin bloquear la sesión real

Sirve para ver cómo queda una pantalla de bloqueo y para probar `hypr/scripts/lock.sh` sin
arriesgar nada: un hyprlock con la config rota puede dejar la sesión en "lockscreen app died", y
probarlo con el PAM real puede bloquear tu cuenta (ver "Por qué es así", punto 4). Lo escribió
Claude el 2026-10-01 al hacer la pantalla de bloqueo; no es parte del escritorio.

## Uso

```bash
cd ~/.config/dotfiles/.claude/lock-harness
./harness-up.sh                                           # compositor anidado oculto + salida virtual 1920x1080
./shot.sh ~/.config/hypr/hyprlock.conf /tmp/lock.png      # bloquea el anidado y guarda el fotograma; 3.er argumento: escala del monitor (no cambia nada: ver abajo)
./locktest.sh                                             # pruebas de lock.sh (T1–T11): bloquear, repetir, zombi, duplicados, re-bloquear, brillo, recuperación
LOCK_SH=/ruta/lock.sh ./locktest.sh                       # lo mismo con una copia de lock.sh (usa los scripts hermanos de su carpeta)
./cpu.sh ~/.config/hypr/hyprlock.conf 30                  # CPU de hyprlock + hijos (ms por segundo) con esa config, 30 s
./dimtest.sh                                              # pruebas de lock-dim.sh (brillo de la laptop, monitores DDC y filtro) con falsos; no necesita el anidado
./harness-down.sh
```

- Estado en `$LOCK_HARNESS_DIR` (por defecto `$XDG_RUNTIME_DIR/lock-harness`): firma de la instancia,
  display, `dump.so` (se compila al levantar), fotogramas y logs.
- `SETTLE=4` espera más antes de volcar (imágenes pesadas); `EXTRA_ENV="PATH=…/stub:$PATH XDG_CACHE_HOME=…"`
  corre hyprlock con otro entorno (un `playerctl` falso, otra caché…); `KEEP=1` deja el bloqueo puesto
  (se suelta con `./unlock.sh`).
- **La escala del monitor no cambia el render**: hyprlock 0.9.6 dibuja en píxeles físicos (un cuadrado de
  400 px mide 400 con escala 1 y con 2, aunque el log diga "Got fractional scale"). El tercer argumento de
  `shot.sh` se acepta pero no sirve para probar HiDPI; las tres pantallas del usuario son 1920×1080.
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
- **Los falsos** (`stub/`) van por `EXTRA_ENV="PATH=$PWD/stub:$PATH …"`: hyprlock hereda el PATH y los
  comandos de `lock-info.sh` y de `hyprlock.conf` los encuentran.
  - `playerctl`: `STUB_MODE=none|playing|long|amp|acentos` (sin reproductor, normal, título y artista
    larguísimos, `&` y `<`, mayúsculas con tilde), `STUB_ART=<url>` pone esa portada (`file://…` o
    `http://…`) y `STUB_STATUS=Paused` lo pausa.
  - `date`: `LOCK_INFO_NOW=$(date -d '2026-09-30 07:24' +%s)` fija la fecha y la hora que ven hyprlock y
    `lock-info.sh`. El 30-sep-2026 es un miércoles: la fecha más larga ("Wednesday, 30 September"), el peor caso
    de ancho; con 00:00 sale la hora más ancha.
  - `brightnessctl`: una retroiluminación inventada en `$FAKE_BL` (raw y max = 21333) que imita `-m`, `-e4`,
    `-n2`, `-d` y `set N`/`set N%`. `locktest.sh` lo fuerza y comprueba al terminar que la real no cambió.
  - `ddcutil`: monitores inventados en `$FAKE_DDC/<bus>/` (archivos `value` y `max`; opcionales `fail` = no
    responde, `delay` = segundos por orden, `asleep_until` = época hasta la que no responde). `lock-dim.sh`
    los encuentra con un sysfs de DRM inventado (`LOCK_DIM_DRM`). Todo queda en `$FAKE_DDC/log`.
  - Baterías inventadas: `LOCK_INFO_PSDIR=<carpeta con BAT0/status, energy_now, energy_full, capacity…>`
    (`EXTRA_ENV`, igual que arriba). Casos que se renderizaron: cargando, descargando, baja (≤ 20 %), sin
    cargar, desconocida, sin batería, dos baterías, `charge_*` en vez de `energy_*` y solo `capacity`.
- **Comparar fuentes lado a lado:** hyprlock comparte la textura de dos etiquetas con el mismo texto, tamaño
  y color aunque la `font_family` sea distinta (la segunda sale con la fuente de la primera). Un texto
  distinto en cada etiqueta (o un color distinto). Un color en `rgba(r, g, b, 255)` tampoco sirve (alfa 0–1):
  hex, `rgba(rrggbbaa)`.
- **Prueba siempre con la salida real de los comandos.** Sustituir una etiqueta por texto fijo en la copia de
  la config no vale: `<br/>` se interpretaba en texto fijo y salía literal en un `cmd[...]` (llegó a la
  config viva unos minutos). Si hay que forzar un texto, que lo imprima un comando (`printf '…'`).
- Para ver el campo de contraseña, copia la config con `fade_on_empty = false`.
- **Medir el CPU:** `cpu.sh` lanza hyprlock con la config tal cual y suma utime+stime (propios y de los hijos)
  durante N segundos. No usa `shot.sh` porque este añade una etiqueta que cambia cada 150 ms para forzar
  redibujados, y eso infla la medida (84 → 131 ms/s en la prueba). Con el reproductor real o con el falso,
  según el `EXTRA_ENV`. Una pantalla: con tres, tres veces (hyprlock instancia los widgets por monitor).

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

## `locktest.sh`: lo que cubre cada caso

T1 bloquear · T2 repetir (no-op, ~45 ms) · T3 desbloquear con el hyprlock que no sale (el PAM falso lo
reproduce) y comprobar que el vigilante lo mata · T4 dos lanzamientos a la vez → un solo hyprlock · T5
re-bloquear con el zombi vivo · T6 el brillo baja al bloquear (21333 → 1333) y vuelve al desbloquear · T7
vuelve al instante si hyprlock sale con la sesión aún bloqueada · T8 con la sesión bloqueada y sin hyprlock
(`hyprctl locked` sigue en `true`), `lock.sh` lo relanza · T9 un valor guardado de un bloqueo anterior se
devuelve antes de bajar · T10 y si matan a `lock.sh` con TERM · T11 el restore de otro dueño se ignora · T12 un monitor DDC dormido al
desbloquear se devuelve cuando despierta (reintentos) · T13 un monitor sin DDC y lento no retrasa el bloqueo ·
T14 el filtro de los monitores sin DDC lo escribe `lock.sh` antes de lanzar hyprlock · T15 un `dim` retrasado
por el candado no baja el brillo de una sesión ya desbloqueada.
El hyprlock que sostiene el bloqueo es el **más nuevo** (`nested | tail -1`): un re-bloqueo a los 0,3 s deja un
zombi anterior vivo, y mandarle el desbloqueo al primero (`head -1`) contaminaba los casos siguientes. Cada
caso de brillo empieza con `reset_session`.

## Sin probar

Teclear en el campo (revelarlo, puntos, fallo de autenticación) y desbloquear con la contraseña
real: se comprueba a mano con el atajo de bloqueo. Varias salidas a la vez (el arnés tiene una).
