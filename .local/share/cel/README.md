# cel: el celular de pruebas con scrcpy

Parte de los [dotfiles](../../../.github/README.md).

`cel` abre [scrcpy](https://github.com/Genymobile/scrcpy) en el celular de pruebas, que tiene el táctil roto y se maneja solo desde el PC. Además de espejar la pantalla, se asegura de que el táctil físico del celular quede **reservado mientras scrcpy está abierto**: así los toques fantasma de la pantalla rota no se mezclan con los que manda scrcpy. Cuando scrcpy se cierra, el táctil se libera solo.

```bash
cel                 # abre scrcpy con la pantalla del celular apagada (-S)
cel --no-audio      # lo que reciba se pasa a scrcpy
```

## Las piezas

| Dónde | Archivo | Qué es |
|---|---|---|
| PC | `~/.local/bin/cel` | El comando. Conecta por adb, compila y copia lo que falte al celular, arma el vigilante y lanza scrcpy |
| PC | `build.sh`, `touchgrab.c` | Fuente y compilación de `touchgrab`. El binario **no está en git**: cada máquina lo compila |
| Celular | `/data/local/tmp/touchwatch.sh` | El vigilante: mira cada segundo si hay un `scrcpy-server` y, mientras exista, mantiene un `touchgrab` |
| Celular | `/data/local/tmp/touchgrab` | Abre `/dev/input/event1` y lo reserva en exclusiva (`EVIOCGRAB`): Android deja de recibir sus eventos. No usa libc, solo syscalls de aarch64 |
| PC | `~/.config/systemd/user/adb.service` | El servidor adb compartido. Al arrancar reconecta el celular y arma el vigilante (si el celular ya tiene el script) |

Los toques que inyecta scrcpy no pasan por `/dev/input`, así que no los afecta la reserva.

**Por qué es seguro si algo falla:** el vigilante corre en el celular y mira el proceso `scrcpy-server`, no al PC. Si el PC se apaga, la red cae o scrcpy muere, el servidor desaparece y el táctil se libera. `touchgrab` es hijo del vigilante y muere con él (`PR_SET_PDEATHSIG`), así que si el vigilante se detiene por cualquier motivo, el táctil vuelve también. Protege además a un `scrcpy` abierto a mano.

`cel` copia `touchgrab` y `touchwatch.sh` al celular si faltan o su contenido cambió (compara sha256). Si cambió el script, cierra el vigilante en marcha para que arranque el nuevo; el táctil queda libre un momento.

## Qué celular

La IP del celular es de tu red local y el repo es público, así que **no está en git**. Va en `~/.config/adb/device.conf`, que leen tanto `cel` como `adb.service`:

```bash
mkdir -p ~/.config/adb
echo 'ADB_DEVICE=192.168.X.Y:5555' > ~/.config/adb/device.conf    # la IP del celular en tu red (Ajustes → Wi-Fi)
chmod 600 ~/.config/adb/device.conf
```

También sirve `CEL_DEVICE=<ip>:5555 cel` para una vez. Sin ninguna de las dos, `cel` usa el único celular que haya conectado por cable. Si cambias de red y el celular cambia de IP, edita ese archivo: `cel` conecta por su cuenta cada vez, y el servicio solo reconecta al arrancar.

## Poner todo en marcha en otra máquina

1. **Paquetes:** `sudo pacman -S scrcpy clang lld`. Están comentados en `~/.config/dotfiles/packages.txt` porque no todas las máquinas los necesitan. `clang` y `lld` solo se usan para compilar `touchgrab`. `scrcpy` ya trae `adb` (`android-tools`).
2. **Servidor adb compartido** (opcional, hace falta Android Studio): `systemctl --user enable --now adb`. Detalle en [SERVICES.md](../../../.config/dotfiles/SERVICES.md). Sin Android Studio, `cel` usa el `adb` del sistema y el servidor lo levanta el propio comando.
3. **Celular, la primera vez y con el cable:** activa la depuración USB, y luego
   ```bash
   adb tcpip 5555       # deja adb escuchando en la red hasta que el celular se reinicie
   ```
   y acepta en el celular la llave RSA de ese PC (**«permitir siempre»**: la autorización de cada PC es propia). La llave vive en `~/.android/` y nunca va a git. El puerto 5555 **no sobrevive a un reinicio del celular** (es la propiedad volátil `service.adb.tcp.port`): después de reiniciarlo hay que repetir `adb tcpip 5555` con el cable, y `cel` lo avisa si no responde.
4. `device.conf` como arriba, y `cel`. La primera vez compila `touchgrab` y copia los dos archivos al celular.

## Si cambias de celular

El táctil de este celular (`M2007J20CG`, nombre en clave `surya`) es `/dev/input/event1`. En otro modelo puede ser otro número. Averígualo con `adb shell getevent -lp` (busca el dispositivo con `ABS_MT_POSITION_X`) y cambia el valor por defecto de `TOUCH` en `touchwatch.sh`.

## Seguridad

- El servidor adb del PC escucha solo en `127.0.0.1:5037`. Nadie de la red local puede usarlo.
- `adb tcpip 5555` hace que el **celular** escuche adb en la red local (hasta que se reinicie). Lo protege la llave RSA: solo los PC que aceptaste pueden conectarse. Con «permitir siempre» esa autorización queda guardada en el celular.
- Los archivos del celular están en `/data/local/tmp`, donde solo escriben `shell` y root: una app normal no puede cambiar el script que se ejecuta como `shell`.
- `touchgrab` no abre sockets ni lee los eventos: solo reserva un dispositivo de entrada y duerme.
- El binario no se versiona a propósito: es un ejecutable opaco que `cel` corre en el celular, y compilándolo en cada máquina siempre corresponde al `.c` que ves. Con clang 22.1.8 sale byte a byte igual al que ya corría en el celular.
- Reiniciar el servidor (`systemctl --user restart adb`) corta a scrcpy y a Android Studio mientras tanto.
