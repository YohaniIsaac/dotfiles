#!/system/bin/sh
# touchwatch: vigila para siempre y reserva el táctil (touchgrab) SOLO mientras exista un scrcpy-server.
# No depende de cómo se abrió scrcpy (cel, scrcpy a mano, con o sin -S): mira el proceso del celular.
# Cuando no hay scrcpy el táctil queda libre. touchgrab es hijo de este script y muere con él
# (PR_SET_PDEATHSIG), así que si el vigilante muere por cualquier motivo el táctil vuelve.
# Los corchetes en los patrones evitan que pgrep se encuentre a sí mismo.
PATTERN="${PATTERN:-[c]om.genymobile.scrcpy.Server}"
TOUCH="${TOUCH:-/dev/input/event1}"
SELF='^sh /data/local/tmp/[t]ouchwatch.sh'

# Una sola instancia: si ya hay otro vigilante, salir.
for p in $(pgrep -f "$SELF"); do
  [ "$p" != "$$" ] && exit 0
done

while true; do
  if pgrep -f "$PATTERN" >/dev/null; then
    /data/local/tmp/touchgrab "$TOUCH" >/dev/null 2>&1 &
    G=$!
    while pgrep -f "$PATTERN" >/dev/null && kill -0 "$G" 2>/dev/null; do sleep 1; done
    kill "$G" 2>/dev/null
    wait "$G" 2>/dev/null
  fi
  sleep 1
done
