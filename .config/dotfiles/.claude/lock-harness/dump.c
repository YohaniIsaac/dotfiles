// dump.c — LD_PRELOAD solo para el arnés de pruebas de hyprlock (nunca en la sesión real).
//
// Hyprland devuelve negro al capturar una salida mientras la sesión está bloqueada, así que
// grim no sirve para ver el bloqueo. Esto intercepta eglSwapBuffers en el propio hyprlock y,
// si existe $DUMP_DIR/trigger, vuelca el fotograma que está a punto de presentar como RGBA
// crudo ($DUMP_DIR/frame-<ancho>x<alto>-<n>.rgba). El trigger contiene cuántos fotogramas
// volcar (por defecto 1) y se borra al llegar a 0.
#define _GNU_SOURCE
#include <EGL/egl.h>
#include <GLES2/gl2.h>
#include <dlfcn.h>
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>

// ── PAM falso ───────────────────────────────────────────────────────────────────────────────
// hyprlock arranca una conversación PAM nada más bloquear. Si el proceso muere con ella
// pendiente (SIGUSR1, kill…), pam_faillock lo cuenta como un login fallido de TU usuario real:
// con 3 se bloquea la cuenta 10 min (también sudo y el desbloqueo real). Pasó en las primeras
// pruebas del arnés (2026-10-01 12:53-12:55). Aquí hyprlock nunca llega al PAM de verdad.
typedef struct pam_handle pam_handle_t;
struct pam_conv;

int pam_start(const char *service, const char *user, const struct pam_conv *conv, pam_handle_t **h) {
    (void)service; (void)user; (void)conv;
    *h = (pam_handle_t *)0x1;
    return 0;
}
int pam_authenticate(pam_handle_t *h, int flags) {
    (void)h; (void)flags;
    for (;;) pause();   // la "conversación" no termina nunca, igual que esperando la contraseña
    return 0;
}
int pam_end(pam_handle_t *h, int status) { (void)h; (void)status; return 0; }
int dump_pam_is_stubbed(void) { return 1; }   // marca para la comprobación previa de shot.sh

// ── Instrumentación de llamadas GL (solo con DUMP_STATS) ─────────────────────────────────────
static GLuint        cur_fbo;
static unsigned long draws_fb0, draws_other, clears_n;

void glBindFramebuffer(GLenum target, GLuint fb) {
    static void (*real)(GLenum, GLuint);
    if (!real) real = (void (*)(GLenum, GLuint))dlsym(RTLD_NEXT, "glBindFramebuffer");
    cur_fbo = fb;
    real(target, fb);
}
void glDrawArrays(GLenum mode, GLint first, GLsizei count) {
    static void (*real)(GLenum, GLint, GLsizei);
    if (!real) real = (void (*)(GLenum, GLint, GLsizei))dlsym(RTLD_NEXT, "glDrawArrays");
    if (cur_fbo == 0) draws_fb0++; else draws_other++;
    real(mode, first, count);
}
void glClear(GLbitfield mask) {
    static void (*real)(GLbitfield);
    if (!real) real = (void (*)(GLbitfield))dlsym(RTLD_NEXT, "glClear");
    clears_n++;
    real(mask);
}

typedef EGLBoolean (*swap_fn)(EGLDisplay, EGLSurface);

EGLBoolean eglSwapBuffers(EGLDisplay dpy, EGLSurface surf) {
    static swap_fn real = NULL;
    static int     n    = 0;
    if (!real) real = (swap_fn)dlsym(RTLD_NEXT, "eglSwapBuffers");

    // DUMP_STATS=1: en cada swap imprime la media RGBA muestreada (sin escribir ficheros).
    if (getenv("DUMP_STATS")) {
        EGLint w = 0, h = 0;
        eglQuerySurface(dpy, surf, EGL_WIDTH, &w);
        eglQuerySurface(dpy, surf, EGL_HEIGHT, &h);
        if (w > 0 && h > 0) {
            unsigned char *buf = malloc((size_t)w * h * 4);
            GLint prev = 0;
            glGetIntegerv(GL_FRAMEBUFFER_BINDING, &prev);
            glBindFramebuffer(GL_FRAMEBUFFER, 0);
            glPixelStorei(GL_PACK_ALIGNMENT, 1);
            glReadPixels(0, 0, w, h, GL_RGBA, GL_UNSIGNED_BYTE, buf);
            glBindFramebuffer(GL_FRAMEBUFFER, (GLuint)prev);
            unsigned long s[4] = {0, 0, 0, 0}, cnt = 0;
            for (size_t i = 0; i < (size_t)w * h; i += 997) {
                for (int c = 0; c < 4; c++) s[c] += buf[i * 4 + c];
                cnt++;
            }
            fprintf(stderr, "[stats] swap %dx%d fbo=%d media RGBA=%lu,%lu,%lu,%lu | draws fb0=%lu otros=%lu clears=%lu\n", w, h, prev,
                    s[0] / cnt, s[1] / cnt, s[2] / cnt, s[3] / cnt, draws_fb0, draws_other, clears_n);
            draws_fb0 = draws_other = clears_n = 0;
            free(buf);
        }
    }

    const char *dir = getenv("DUMP_DIR");
    if (dir) {
        char trig[600];
        snprintf(trig, sizeof trig, "%s/trigger", dir);
        FILE *t = fopen(trig, "r");
        if (t) {
            int left = 1;
            if (fscanf(t, "%d", &left) != 1) left = 1;
            fclose(t);

            EGLint w = 0, h = 0;
            eglQuerySurface(dpy, surf, EGL_WIDTH, &w);
            eglQuerySurface(dpy, surf, EGL_HEIGHT, &h);
            if (w > 0 && h > 0) {
                unsigned char *buf = malloc((size_t)w * h * 4);
                GLint prev = 0;
                glGetIntegerv(GL_FRAMEBUFFER_BINDING, &prev);
                glBindFramebuffer(GL_FRAMEBUFFER, 0);
                glPixelStorei(GL_PACK_ALIGNMENT, 1);
                glReadPixels(0, 0, w, h, GL_RGBA, GL_UNSIGNED_BYTE, buf);
                GLenum err = glGetError();
                glBindFramebuffer(GL_FRAMEBUFFER, (GLuint)prev);
                if (getenv("DUMP_DEBUG"))
                    fprintf(stderr, "[dump] swap %dx%d fbo_previo=%d glerror=0x%x\n", w, h, prev, err);

                char path[700];
                snprintf(path, sizeof path, "%s/frame-%dx%d-%d.rgba", dir, w, h, n++);
                FILE *f = fopen(path, "wb");
                if (f) { fwrite(buf, 1, (size_t)w * h * 4, f); fclose(f); }
                free(buf);

                if (--left <= 0) unlink(trig);
                else if ((t = fopen(trig, "w"))) { fprintf(t, "%d\n", left); fclose(t); }
            }
        }
    }
    return real(dpy, surf);
}
