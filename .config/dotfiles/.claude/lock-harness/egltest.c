// egltest.c — cliente Wayland+EGL mínimo para validar dump.so: pinta #20a040 y llama a
// eglSwapBuffers varias veces. Si el volcado funciona, el píxel central debe ser 32,160,64,255.
#define _GNU_SOURCE
#include <EGL/egl.h>
#include <GLES2/gl2.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <wayland-client.h>
#include <wayland-egl.h>
#include "xdg-shell-client-protocol.h"

static struct wl_compositor *comp;
static struct xdg_wm_base   *wm;
static int configured;

static void reg_global(void *d, struct wl_registry *r, uint32_t name, const char *iface, uint32_t ver) {
    (void)d; (void)ver;
    if (!strcmp(iface, wl_compositor_interface.name)) comp = wl_registry_bind(r, name, &wl_compositor_interface, 4);
    else if (!strcmp(iface, xdg_wm_base_interface.name)) wm = wl_registry_bind(r, name, &xdg_wm_base_interface, 1);
}
static void reg_remove(void *d, struct wl_registry *r, uint32_t n) { (void)d; (void)r; (void)n; }
static const struct wl_registry_listener reg_l = { reg_global, reg_remove };

static void wm_ping(void *d, struct xdg_wm_base *w, uint32_t s) { (void)d; xdg_wm_base_pong(w, s); }
static const struct xdg_wm_base_listener wm_l = { .ping = wm_ping };

static void xs_conf(void *d, struct xdg_surface *xs, uint32_t serial) { (void)d; xdg_surface_ack_configure(xs, serial); configured = 1; }
static const struct xdg_surface_listener xs_l = { .configure = xs_conf };

static void tl_conf(void *d, struct xdg_toplevel *t, int32_t w, int32_t h, struct wl_array *s) { (void)d; (void)t; (void)w; (void)h; (void)s; }
static void tl_close(void *d, struct xdg_toplevel *t) { (void)d; (void)t; }
static const struct xdg_toplevel_listener tl_l = { .configure = tl_conf, .close = tl_close };

int main(void) {
    struct wl_display *dpy = wl_display_connect(NULL);
    if (!dpy) { fprintf(stderr, "sin display\n"); return 1; }
    struct wl_registry *reg = wl_display_get_registry(dpy);
    wl_registry_add_listener(reg, &reg_l, NULL);
    wl_display_roundtrip(dpy);
    if (!comp || !wm) { fprintf(stderr, "faltan globals\n"); return 1; }
    xdg_wm_base_add_listener(wm, &wm_l, NULL);

    struct wl_surface   *surf = wl_compositor_create_surface(comp);
    struct xdg_surface  *xs   = xdg_wm_base_get_xdg_surface(wm, surf);
    xdg_surface_add_listener(xs, &xs_l, NULL);
    struct xdg_toplevel *tl   = xdg_surface_get_toplevel(xs);
    xdg_toplevel_add_listener(tl, &tl_l, NULL);
    xdg_toplevel_set_title(tl, "egltest");
    wl_surface_commit(surf);
    for (int i = 0; i < 50 && !configured; i++) wl_display_roundtrip(dpy);

    EGLDisplay ed = eglGetDisplay((EGLNativeDisplayType)dpy);
    eglInitialize(ed, NULL, NULL);
    eglBindAPI(EGL_OPENGL_ES_API);
    const EGLint ca[] = { EGL_SURFACE_TYPE, EGL_WINDOW_BIT, EGL_RENDERABLE_TYPE, EGL_OPENGL_ES2_BIT,
                          EGL_RED_SIZE, 8, EGL_GREEN_SIZE, 8, EGL_BLUE_SIZE, 8, EGL_ALPHA_SIZE, 8, EGL_NONE };
    EGLConfig cfg; EGLint n = 0;
    eglChooseConfig(ed, ca, &cfg, 1, &n);
    const EGLint xa[] = { EGL_CONTEXT_CLIENT_VERSION, 2, EGL_NONE };
    EGLContext ctx = eglCreateContext(ed, cfg, EGL_NO_CONTEXT, xa);
    struct wl_egl_window *win = wl_egl_window_create(surf, 400, 300);
    EGLSurface es = eglCreateWindowSurface(ed, cfg, (EGLNativeWindowType)win, NULL);
    eglMakeCurrent(ed, es, es, ctx);
    eglSwapInterval(ed, 0);

    for (int i = 0; i < 12; i++) {
        glViewport(0, 0, 400, 300);
        glClearColor(32 / 255.f, 160 / 255.f, 64 / 255.f, 1.f);
        glClear(GL_COLOR_BUFFER_BIT);
        eglSwapBuffers(ed, es);
        wl_display_roundtrip(dpy);
        usleep(100000);
    }
    return 0;
}
