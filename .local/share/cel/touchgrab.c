// touchgrab: reserva un dispositivo de entrada en exclusiva (EVIOCGRAB) y se queda dormido.
// Mientras el proceso viva, Android no recibe los eventos de ese dispositivo (el táctil roto).
// Sin libc: syscalls directas de aarch64 (Linux), para enlazar estático sin sysroot.
// Los toques que inyecta scrcpy no pasan por /dev/input, así que no se ven afectados.

#define SYS_IOCTL 29
#define SYS_OPENAT 56
#define SYS_WRITE 64
#define SYS_PPOLL 73
#define SYS_EXIT 94
#define SYS_PRCTL 167
#define SYS_GETPPID 173
#define AT_FDCWD (-100)
#define EVIOCGRAB 0x40044590L // _IOW('E', 0x90, int)

static long sys4(long n, long a, long b, long c, long d) {
    register long x8 __asm__("x8") = n;
    register long x0 __asm__("x0") = a;
    register long x1 __asm__("x1") = b;
    register long x2 __asm__("x2") = c;
    register long x3 __asm__("x3") = d;
    __asm__ volatile("svc 0" : "+r"(x0) : "r"(x8), "r"(x1), "r"(x2), "r"(x3) : "memory", "cc");
    return x0;
}

static void say(const char *s) {
    long n = 0;
    while (s[n]) n++;
    sys4(SYS_WRITE, 1, (long)s, n, 0);
}

static void say_num(long v) {
    char buf[24];
    int i = 23;
    buf[i] = 0;
    int neg = v < 0;
    if (neg) v = -v;
    do { buf[--i] = '0' + (v % 10); v /= 10; } while (v);
    if (neg) buf[--i] = '-';
    say(&buf[i]);
}

void entry(long *sp) {
    long argc = sp[0];
    const char *path = argc > 1 ? (const char *)sp[2] : "/dev/input/event1";

    // Seguro: si el proceso padre (el guardián) muere, este proceso muere y el táctil vuelve solo.
    sys4(SYS_PRCTL, 1 /* PR_SET_PDEATHSIG */, 9 /* SIGKILL */, 0, 0);
    if (sys4(SYS_GETPPID, 0, 0, 0, 0) == 1) sys4(SYS_EXIT, 3, 0, 0, 0); // el padre ya había muerto

    long fd = sys4(SYS_OPENAT, AT_FDCWD, (long)path, 0 /* O_RDONLY */, 0);
    if (fd < 0) { say("open fallo, errno="); say_num(-fd); say("\n"); sys4(94, 1, 0, 0, 0); }

    long r = sys4(SYS_IOCTL, fd, EVIOCGRAB, 1, 0);
    if (r < 0) { say("EVIOCGRAB fallo, errno="); say_num(-r); say("\n"); sys4(94, 2, 0, 0, 0); }

    say("grab OK: "); say(path); say("\n");
    for (;;) sys4(SYS_PPOLL, 0, 0, 0, 0); // dormir para siempre; el fd abierto mantiene el grab
}

__asm__(".global _start\n"
        "_start:\n"
        "  mov x0, sp\n"
        "  bl entry\n");
