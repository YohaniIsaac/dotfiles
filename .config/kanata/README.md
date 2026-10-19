# Kanata (scroll con el teclado)

Remapeo de teclas con [kanata](https://github.com/jtroo/kanata): un toque corto de Caps Lock funciona normal y, mantenido, `h/j/k/l` hacen scroll. Parte de los [dotfiles](../../.github/README.md). Es el [paso 25 de la guía de instalación](../dotfiles/INSTALL.md#25-kanata-scroll-con-el-teclado).

## Archivos

| Archivo | Qué hay |
|---|---|
| `scroll.kbd` | La config de kanata |
| `system/` | `99-input.rules` (regla udev, va en `/etc/udev/rules.d/`) y `uinput.conf` (carga del módulo, va en `/etc/modules-load.d/`) |
| `setup.sh` | Instala `system/`, crea el grupo, agrega al usuario y habilita `kanata.service` |

El servicio es una unidad de usuario (`~/.config/systemd/user/kanata.service`).

## Instalación, uso y problemas

Kanata lee los teclados y crea un teclado virtual en `/dev/uinput`, que por defecto solo puede usar root. Todo lo necesario está en `~/.config/kanata/`: la config (`scroll.kbd`), los archivos de sistema (`system/`) y un script que los instala:

```bash
bash ~/.config/kanata/setup.sh
```

El script copia `system/99-input.rules` a `/etc/udev/rules.d/` y `system/uinput.conf` a `/etc/modules-load.d/`, crea el grupo `uinput`, agrega tu usuario a `input` y `uinput`, y habilita `kanata.service`.

El servicio recién puede abrir `/dev/uinput` después de **reiniciar**. Cerrar sesión no alcanza si el user manager de systemd (`systemd --user`) sigue vivo, porque conserva los grupos con los que arrancó. Si no puedes reiniciar todavía, lánzalo a mano con el grupo nuevo. `sg` funciona apenas eres miembro, sin volver a entrar:

```bash
sg uinput -c "setsid -f kanata --cfg $HOME/.config/kanata/scroll.kbd >> $HOME/.cache/kanata-manual.log 2>&1 < /dev/null"
```

La salida va a un archivo a propósito: si kanata escribe en una terminal que ya se cerró (por ejemplo, al desconectarse un teclado Bluetooth), se cae. Después de reiniciar, el servicio toma el control solo.

La configuración está en `~/.config/kanata/scroll.kbd`: un toque corto de Caps Lock funciona normal, y mantenido + `h/j/k/l` hace scroll. Para cerrar kanata en una emergencia: `Ctrl izq + Espacio + Esc`.

**Si una tecla deja de funcionar en todas las aplicaciones (incidente del 2026-10-08, la `i`).** Una sola tecla dejó de llegar a las aplicaciones y a la pantalla de bloqueo (ni un punto en el campo de contraseña), con la sesión bloqueada desde la noche anterior. Lo que se comprobó:

- La tecla sí llegaba al sistema: leyendo el dispositivo virtual de kanata (`/dev/input/eventN`) salían los eventos `KEY_I` completos, con el teclado interno y con otro.
- Una ventana GTK de prueba recibía las demás letras pero ninguna `i`.
- Con kanata detenido, la `i` llegaba bien directo desde el teclado del portátil; al reiniciar kanata (dispositivo virtual nuevo) volvió a funcionar todo. Ninguna configuración la interceptaba: ni kanata (solo mapea Caps y `hjkl`), ni atajos de Hyprland, ni opciones XKB, `hwdb`, métodos de entrada, plugins o paquetes nuevos. Android Studio (se había usado el día anterior) tampoco influyó.
- La causa exacta no se conoce. Sospecha: Hyprland perdió el seguimiento de esa tecla en el dispositivo virtual viejo. Kanata agarra también la interfaz de teclado del mouse Bluetooth (M65 5.0 aquí) y la suelta cada vez que el mouse se duerme (`Failed to ungrab device` en `~/.cache/kanata-manual.log`); el problema apareció justo cuando ese mouse se reconectó.

Arreglo: reiniciar kanata, sin cerrar nada más (las ventanas no se tocan):

```bash
pkill -x kanata; sleep 1
sg uinput -c "setsid -f kanata --cfg $HOME/.config/kanata/scroll.kbd >> $HOME/.cache/kanata-manual.log 2>&1 < /dev/null"
```

(Con el servicio activo tras reiniciar el equipo: `systemctl --user restart kanata`.) Para ver en qué capa se pierde una tecla: `hyprctl binds` (¿algún atajo?), el dispositivo `kanata` en `/proc/bus/input/devices` (¿salen sus eventos?) y probar un momento con kanata detenido. Posible endurecimiento, sin hacer: limitar kanata al teclado interno con `linux-dev` en `defcfg`, para que no agarre teclados de mouses Bluetooth.

Si pasa con la sesión bloqueada y no puedes escribir la contraseña, el desbloqueo de emergencia es `kill -USR1 <pid de hyprlock>` (dirigido a ese PID exacto). Ojo: un hyprlock que sale con la conversación PAM pendiente puede contar como un intento fallido en `faillock`, y tres en 15 minutos bloquean la cuenta 10 minutos (también `sudo`); los intentos con contraseña mala suman igual (`faillock --user $USER` lo muestra).
