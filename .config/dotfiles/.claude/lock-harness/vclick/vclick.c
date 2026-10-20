// vclick — puntero virtual (zwlr_virtual_pointer_v1) para el compositor ANIDADO de pruebas.
//   vclick move X Y            mueve el puntero a X,Y (px del layout del compositor)
//   vclick click X Y [btn]     mueve y hace clic (btn: 272 izq, 273 der, 274 medio)
//   vclick down|up [btn]       solo pulsar / soltar
// Hace falta WAYLAND_DISPLAY apuntando al anidado. extent = tamaño del layout (EXT_W x EXT_H).
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <wayland-client.h>
#include "vptr-client.h"

static struct wl_seat *seat; static struct zwlr_virtual_pointer_manager_v1 *mgr;
static void reg(void *d, struct wl_registry *r, uint32_t name, const char *iface, uint32_t ver) {
  if (!strcmp(iface, "wl_seat") && !seat) seat = wl_registry_bind(r, name, &wl_seat_interface, 1);
  else if (!strcmp(iface, "zwlr_virtual_pointer_manager_v1")) mgr = wl_registry_bind(r, name, &zwlr_virtual_pointer_manager_v1_interface, 1);
}
static void rem(void *d, struct wl_registry *r, uint32_t n) {}
static const struct wl_registry_listener rl = { reg, rem };

int main(int argc, char **argv) {
  if (argc < 2) { fprintf(stderr, "uso: vclick move|click X Y [btn] | down|up [btn]\n"); return 2; }
  struct wl_display *dpy = wl_display_connect(NULL);
  if (!dpy) { fprintf(stderr, "sin WAYLAND_DISPLAY\n"); return 1; }
  struct wl_registry *r = wl_display_get_registry(dpy);
  wl_registry_add_listener(r, &rl, NULL);
  wl_display_roundtrip(dpy);
  if (!mgr) { fprintf(stderr, "el compositor no ofrece zwlr_virtual_pointer_manager_v1\n"); return 1; }
  struct zwlr_virtual_pointer_v1 *p = zwlr_virtual_pointer_manager_v1_create_virtual_pointer(mgr, seat);
  const char *ew = getenv("EXT_W"), *eh = getenv("EXT_H");
  unsigned W = ew ? atoi(ew) : 1920, H = eh ? atoi(eh) : 1080;
  unsigned t = 1000;
  const char *cmd = argv[1];
  if (!strcmp(cmd, "move") || !strcmp(cmd, "click")) {
    unsigned x = atoi(argv[2]), y = atoi(argv[3]);
    zwlr_virtual_pointer_v1_motion_absolute(p, t, x, y, W, H);
    zwlr_virtual_pointer_v1_frame(p);
    wl_display_roundtrip(dpy);
    if (!strcmp(cmd, "click")) {
      unsigned btn = argc > 4 ? atoi(argv[4]) : 272;
      usleep(60000);
      zwlr_virtual_pointer_v1_button(p, t + 60, btn, 1); zwlr_virtual_pointer_v1_frame(p);
      wl_display_roundtrip(dpy);
      usleep(80000);
      zwlr_virtual_pointer_v1_button(p, t + 140, btn, 0); zwlr_virtual_pointer_v1_frame(p);
    }
  } else if (!strcmp(cmd, "down") || !strcmp(cmd, "up")) {
    unsigned btn = argc > 2 ? atoi(argv[2]) : 272;
    zwlr_virtual_pointer_v1_button(p, t, btn, !strcmp(cmd, "down") ? 1 : 0); zwlr_virtual_pointer_v1_frame(p);
  }
  wl_display_roundtrip(dpy);
  zwlr_virtual_pointer_v1_destroy(p);
  wl_display_roundtrip(dpy);
  wl_display_disconnect(dpy);
  return 0;
}
