/*
 * H4 root ownership — the only native code in DVL: flock(2) on an fd the JS side opened
 * (libuv opens it close-on-exec, so adapter children never inherit the lock).
 * Returns 0 when the exclusive lock is held, otherwise errno (EWOULDBLOCK = owned elsewhere).
 * The lock is released by closing the fd, or by the OS when the process dies.
 */
#include <errno.h>
#include <node_api.h>
#include <sys/file.h>
#ifdef __APPLE__
#include <libproc.h>
#include <stdio.h>
#endif

/* Kernel-captured incarnation, not a provider claim. PID alone may be reused. */
static napi_value process_birth(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1], out;
  int32_t pid;
  if (napi_get_cb_info(env, info, &argc, argv, NULL, NULL) != napi_ok || argc < 1 ||
      napi_get_value_int32(env, argv[0], &pid) != napi_ok || pid <= 0) {
    napi_throw_type_error(env, NULL, "processBirth(pid): pid must be positive");
    return NULL;
  }
#ifdef __APPLE__
  struct proc_bsdinfo p;
  if (proc_pidinfo(pid, PROC_PIDTBSDINFO, 0, &p, sizeof(p)) == sizeof(p)) {
    char birth[80];
    snprintf(birth, sizeof(birth), "%llu:%llu", (unsigned long long)p.pbi_start_tvsec,
             (unsigned long long)p.pbi_start_tvusec);
    napi_create_string_utf8(env, birth, NAPI_AUTO_LENGTH, &out);
    return out;
  }
#endif
  napi_get_null(env, &out);
  return out;
}

static napi_value try_lock_exclusive(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1];
  int32_t fd;
  if (napi_get_cb_info(env, info, &argc, argv, NULL, NULL) != napi_ok || argc < 1 ||
      napi_get_value_int32(env, argv[0], &fd) != napi_ok) {
    napi_throw_type_error(env, NULL, "tryLockExclusive(fd): fd must be an integer");
    return NULL;
  }
  int rc;
  do {
    rc = flock(fd, LOCK_EX | LOCK_NB);
  } while (rc != 0 && errno == EINTR);
  napi_value out;
  napi_create_int32(env, rc == 0 ? 0 : errno, &out);
  return out;
}

NAPI_MODULE_INIT() {
  napi_value fn;
  napi_create_function(env, "tryLockExclusive", NAPI_AUTO_LENGTH, try_lock_exclusive, NULL, &fn);
  napi_set_named_property(env, exports, "tryLockExclusive", fn);
  napi_create_function(env, "processBirth", NAPI_AUTO_LENGTH, process_birth, NULL, &fn);
  napi_set_named_property(env, exports, "processBirth", fn);
  return exports;
}
