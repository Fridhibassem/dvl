/* DVL C1 boundary prototype. No provider, mutation or shell API.
 * One immutable root per serial persistent session. All output is buffered until identity
 * checks pass. OS confinement is mandatory, never a path-only fallback.
 * macOS Seatbelt branch MUST be qualified on the target Mac before acceptance.
 */
#define _GNU_SOURCE
#include <sys/types.h>
#include <sys/stat.h>
#include <fcntl.h>
#include <unistd.h>
#include <dirent.h>
#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <ctype.h>
#include <sys/resource.h>
#include <pwd.h>
#include <stdarg.h>
#include "read-policy.h"
#ifdef __APPLE__
#include <sandbox.h>
#include <libproc.h>
#include <sys/proc_info.h>
#elif defined(__linux__)
#include <linux/landlock.h>
#include <sys/syscall.h>
#include <sys/prctl.h>
#endif

#define MAX_READ (1024*1024)
#define MAX_OUT (2*1024*1024+4096)
static char output[MAX_OUT];
static size_t used;
static int output_failed;
static const char *mode;
static int fail(const char *code) { printf("{\"ok\":false,\"error\":\"%s\"}\n",code); return 1; }
static int same(struct stat a, struct stat b) { return a.st_dev==b.st_dev && a.st_ino==b.st_ino; }
static int unchanged(struct stat a,struct stat b) {
#ifdef __APPLE__
 return same(a,b)&&a.st_size==b.st_size&&a.st_mtimespec.tv_sec==b.st_mtimespec.tv_sec&&a.st_mtimespec.tv_nsec==b.st_mtimespec.tv_nsec&&a.st_ctimespec.tv_sec==b.st_ctimespec.tv_sec&&a.st_ctimespec.tv_nsec==b.st_ctimespec.tv_nsec;
#else
 return same(a,b)&&a.st_size==b.st_size&&a.st_mtim.tv_sec==b.st_mtim.tv_sec&&a.st_mtim.tv_nsec==b.st_mtim.tv_nsec&&a.st_ctim.tv_sec==b.st_ctim.tv_sec&&a.st_ctim.tv_nsec==b.st_ctim.tv_nsec;
#endif
}
static void append(const char *fmt,...) {
 if(output_failed||used>=sizeof output){output_failed=1;return;}
 va_list args;va_start(args,fmt);int n=vsnprintf(output+used,sizeof output-used,fmt,args);va_end(args);
 if(n<0||(size_t)n>=sizeof output-used){output_failed=1;return;}used+=(size_t)n;
}
static void hex(const unsigned char *b,size_t n) { static const char *h="0123456789abcdef";if(output_failed||n>(sizeof output-used)/2){output_failed=1;return;}for(size_t i=0;i<n;i++){output[used++]=h[b[i]>>4];output[used++]=h[b[i]&15];} }
static int decode(const char *s,char *out,size_t cap) {
 size_t n=strlen(s);if(n%2||n/2>=cap)return -1;
 for(size_t i=0;i<n;i+=2){if(!isxdigit((unsigned char)s[i])||!isxdigit((unsigned char)s[i+1]))return -1;unsigned x;sscanf(s+i,"%2x",&x);if(!x)return -1;out[i/2]=(char)x;}out[n/2]=0;return 0;
}
static int denied(const char *s) {
 /* Conservatively deny stored names containing long-s, Kelvin or sharp-s. */
 if(strstr(s,"\xC5\xBF")||strstr(s,"\xE2\x84\xAA")||strstr(s,"\xC3\x9F")||strstr(s,"\xE1\xBA\x9E"))return 1;
 char b[4096];size_t n=strlen(s);if(n>=sizeof b)return 1;for(size_t i=0;i<=n;i++)b[i]=(char)tolower((unsigned char)s[i]);
 for(int i=0;policy_deniedNames[i];i++)if(!strcmp(b,policy_deniedNames[i]))return 1;
 for(int i=0;policy_deniedPrefixes[i];i++)if(!strncmp(b,policy_deniedPrefixes[i],strlen(policy_deniedPrefixes[i])))return 1;
 const char *ext=strrchr(b,'.');if(ext)for(int i=0;policy_deniedExtensions[i];i++)if(!strcmp(ext,policy_deniedExtensions[i]))return 1;return 0;
}
static int within(const char *parent,const char *p){size_t n=strlen(parent);return !strcmp(parent,p)||(n==1&&parent[0]=='/')||(!strncmp(parent,p,n)&&p[n]=='/');}
static int ancestor(const char *parent,const char *p){
 if(within(parent,p))return 1;
 struct stat a,b;if(stat(parent,&a))return 0;char cur[32768];if(strlen(p)>=sizeof cur)return 0;strcpy(cur,p);
 for(int n=0;n<256;n++){if(!stat(cur,&b)&&same(a,b))return 1;char *slash=strrchr(cur,'/');if(!slash||slash==cur)break;*slash=0;}return 0;
}
static int root_allowed(const char *root){
 for(int i=0;policy_rootExact[i];i++)if(!strcmp(root,policy_rootExact[i])||(ancestor(root,policy_rootExact[i])&&ancestor(policy_rootExact[i],root)))return 0;
 for(int i=0;policy_rootTrees[i];i++)if(ancestor(policy_rootTrees[i],root))return 0;
 struct passwd *pw=getpwuid(getuid());char home[16385];if(!pw||!realpath(pw->pw_dir,home))return 0;
 if(ancestor(root,home))return 0;
 for(int i=0;policy_homeTrees[i];i++){char protected[32768];int n=snprintf(protected,sizeof protected,"%s/%s",home,policy_homeTrees[i]);if(n<0||(size_t)n>=sizeof protected)return 0;if(ancestor(root,protected)||ancestor(protected,root))return 0;}
 const char *custom=getenv("DVL_USER_DATA");if(custom&&*custom){if(custom[0]!='/'||ancestor(root,custom)||ancestor(custom,root))return 0;}
 return 1;
}
/* Never approximate the filesystem's Unicode folding. Require an exact stored
 * directory-entry spelling BEFORE openat, then bind that name to the opened fd.
 * Enumeration has independent position (dup alone would share readdir offset).
 */
static int exact_entry(int parent,const char *name,struct stat *st){
 int scan=openat(parent,".",O_RDONLY|O_DIRECTORY|O_CLOEXEC);if(scan<0)return -1;
 DIR *d=fdopendir(scan);if(!d){close(scan);return -1;}struct dirent *e;unsigned n=0;int found=0;
 while((e=readdir(d))){if(++n>10002)break;if(!strcmp(name,e->d_name)){found=1;break;}}
 closedir(d);if(!found){struct stat alias;if(fstatat(parent,name,&alias,AT_SYMLINK_NOFOLLOW)==0)errno=EILSEQ;return -1;}if(denied(name)){errno=EACCES;return -1;}
 return fstatat(parent,name,st,AT_SYMLINK_NOFOLLOW);
}
/* A separate process has one thread and opens no fds while this runs. */
static int close_inherited(void){
#ifdef __APPLE__
 size_t cap=64;
 for(int tries=0;tries<12;tries++,cap*=2){
  size_t bytes=cap*sizeof(struct proc_fdinfo);struct proc_fdinfo *list=malloc(bytes);if(!list)return -1;
  int got=proc_pidinfo(getpid(),PROC_PIDLISTFDS,0,list,(int)bytes);
  if(got<=0||got%(int)sizeof(*list)){free(list);return -1;}
  if((size_t)got>=bytes){free(list);continue;}
  for(size_t i=0;i<(size_t)got/sizeof(*list);i++)if(list[i].proc_fd>=3)close(list[i].proc_fd);
  free(list);
  struct proc_fdinfo verify[64];got=proc_pidinfo(getpid(),PROC_PIDLISTFDS,0,verify,sizeof verify);
  if(got<=0||got>=(int)sizeof verify||got%(int)sizeof(*verify))return -1;
  for(size_t i=0;i<(size_t)got/sizeof(*verify);i++)if(verify[i].proc_fd>=3)return -1;
  return 0;
 }return -1;
#elif defined(__linux__)
 if(syscall(SYS_close_range,3U,~0U,0)==0)return 0;
 /* /proc enumeration also covers descriptors above a lowered soft limit. */
 DIR *d=opendir("/proc/self/fd");if(!d)return -1;int own=dirfd(d);struct dirent *e;
 while((e=readdir(d))){char *end;long fd=strtol(e->d_name,&end,10);if(*e->d_name&&!*end&&fd>=3&&fd!=own)close((int)fd);}closedir(d);return 0;
#else
 return -1;
#endif
}
/* Validate every lexical component before any project I/O. */
static const char *valid(const char *rel) {
 if(!strcmp(rel,"."))return NULL;
 if(!*rel||strlen(rel)>4096||*rel=='/'||strchr(rel,'\\')||strchr(rel,':'))return "PATH_DENIED";
 char b[4097];strcpy(b,rel);unsigned depth=0;char *start=b;
 for(char *p=b;;p++){if(*p=='/'||!*p){int end=!*p;*p=0;if(!*start||!strcmp(start,".")||!strcmp(start,"..")||++depth>64)return "PATH_DENIED";if(denied(start))return "POLICY_DENIED";if(end)break;start=p+1;}}
 return NULL;
}
static int confine(int rootfd,const char *root) {
#ifdef __APPLE__
 (void)rootfd;
 /* Pass the canonical root as data, never interpolate SBPL source. */
 for(const unsigned char *p=(const unsigned char*)root;*p;p++)if(*p<32||*p==127)return -1;
 extern int sandbox_init_with_parameters(const char *,uint64_t,const char *const [],char **);
 const char *parameters[]={"DVL_PROJECT_ROOT",root,NULL};
 const char *profile="(version 1)(deny default)(allow file-read* (subpath (param \"DVL_PROJECT_ROOT\")))";
 char *error=NULL;int r=sandbox_init_with_parameters(profile,0,parameters,&error);if(error)sandbox_free_error(error);if(r)return -1;mode="seatbelt";
#elif defined(__linux__)
 (void)root;
 int abi=(int)syscall(SYS_landlock_create_ruleset,NULL,0,LANDLOCK_CREATE_RULESET_VERSION);if(abi<3)return -1;
 struct landlock_ruleset_attr rules={.handled_access_fs=LANDLOCK_ACCESS_FS_EXECUTE|LANDLOCK_ACCESS_FS_WRITE_FILE|LANDLOCK_ACCESS_FS_READ_FILE|LANDLOCK_ACCESS_FS_READ_DIR|LANDLOCK_ACCESS_FS_REMOVE_DIR|LANDLOCK_ACCESS_FS_REMOVE_FILE|LANDLOCK_ACCESS_FS_MAKE_CHAR|LANDLOCK_ACCESS_FS_MAKE_DIR|LANDLOCK_ACCESS_FS_MAKE_REG|LANDLOCK_ACCESS_FS_MAKE_SOCK|LANDLOCK_ACCESS_FS_MAKE_FIFO|LANDLOCK_ACCESS_FS_MAKE_BLOCK|LANDLOCK_ACCESS_FS_MAKE_SYM};
 rules.handled_access_fs|=(1ULL<<13)|(1ULL<<14); /* ABI2 REFER, ABI3 TRUNCATE */
 if(abi>=5)rules.handled_access_fs|=(1ULL<<15); /* ABI5 IOCTL_DEV, header-independent */
 int fd=(int)syscall(SYS_landlock_create_ruleset,&rules,sizeof rules,0);if(fd<0)return -1;
 struct landlock_path_beneath_attr beneath={.allowed_access=LANDLOCK_ACCESS_FS_READ_FILE|LANDLOCK_ACCESS_FS_READ_DIR,.parent_fd=rootfd};
 int r=(int)syscall(SYS_landlock_add_rule,fd,LANDLOCK_RULE_PATH_BENEATH,&beneath,0);
 if(!r)r=prctl(PR_SET_NO_NEW_PRIVS,1,0,0,0);if(!r)r=(int)syscall(SYS_landlock_restrict_self,fd,0);close(fd);if(r)return -1;mode="landlock";
#else
 (void)rootfd;(void)root;return -1;
#endif
 /* Positive self-check: a known system file must not be readable. */
 int probe=open("/etc/passwd",O_RDONLY|O_NOFOLLOW|O_NONBLOCK);if(probe>=0){close(probe);return -1;}if(errno!=EACCES&&errno!=EPERM)return -1;
 return 0;
}
static const char *ioerr(void) { switch(errno){case ENOENT:return "NOT_FOUND";case EACCES:case EPERM:return "PERMISSION_DENIED";case ELOOP:return "SYMLINK_DENIED";case ENOTDIR:case EILSEQ:case EXDEV:return "PATH_DENIED";case ENOTSUP:return "NOT_REGULAR_FILE";case ESTALE:return "FILE_CHANGED";default:return "RUNTIME_FAILED";} }
/* Each parent anchored in an fd, no path concatenation for actual opens. */
static int walk(int rootfd,const char *rel,int directory) {
 int fd=openat(rootfd,".",O_RDONLY|O_DIRECTORY|O_CLOEXEC);if(fd<0)return -1;if(!strcmp(rel,"."))return fd;
 char b[4097];strcpy(b,rel);char *save=NULL,*s=strtok_r(b,"/",&save);
 while(s){
  char *next=strtok_r(NULL,"/",&save);struct stat named,opened;
  if(exact_entry(fd,s,&named)){close(fd);return -1;}
  if(S_ISLNK(named.st_mode)){close(fd);errno=ELOOP;return -1;}
  if((next||directory)?!S_ISDIR(named.st_mode):!S_ISREG(named.st_mode)){close(fd);errno=ENOTSUP;return -1;}
  struct stat rootst;if(fstat(rootfd,&rootst)||named.st_dev!=rootst.st_dev){close(fd);errno=EXDEV;return -1;}
  int nf=openat(fd,s,O_RDONLY|O_NOFOLLOW|O_NONBLOCK|O_CLOEXEC|((next||directory)?O_DIRECTORY:0));int e=errno;
  if(nf>=0&&(fstat(nf,&opened)||!same(named,opened)||fstatat(fd,s,&named,AT_SYMLINK_NOFOLLOW)||!same(named,opened))){close(nf);nf=-1;e=ESTALE;}
  close(fd);errno=e;if(nf<0)return -1;fd=nf;s=next;
 }return fd;
}
static int operation_fd=-1;
static int operation_inner(int rootfd,struct stat rs,const char *root,const char *op,const char *rel,unsigned long offset){
 used=0;output_failed=0;
 operation_fd=walk(rootfd,rel,!strcmp(op,"list"));int fd=operation_fd;if(fd<0)return fail(ioerr());struct stat before;if(fstat(fd,&before))return fail("RUNTIME_FAILED");
 if(!strcmp(op,"read")){
  if(!S_ISREG(before.st_mode))return fail("NOT_REGULAR_FILE");if(before.st_nlink!=1)return fail("HARDLINK_DENIED");if(before.st_size>MAX_READ)return fail("FILE_TOO_LARGE");
  static unsigned char bytes[MAX_READ+1];size_t n=0;while(n<sizeof bytes){ssize_t r=read(fd,bytes+n,sizeof bytes-n);if(r<0){if(errno==EINTR)continue;return fail(ioerr());}if(!r)break;n+=(size_t)r;}if(n>MAX_READ)return fail("FILE_TOO_LARGE");
  struct stat after;if(fstat(fd,&after)||!unchanged(before,after)||after.st_nlink!=1)return fail("FILE_CHANGED");
  if(memchr(bytes,0,n))return fail("UNSUPPORTED_ENCODING");
  used=0;append("{\"ok\":true,\"mode\":\"%s\",\"hex\":\"",mode);hex(bytes,n);append("\",\"bytes\":%zu,\"dev\":\"%llu\",\"ino\":\"%llu\"}",n,(unsigned long long)before.st_dev,(unsigned long long)before.st_ino);
 }else{
 int scanfd=dup(fd);DIR *d=scanfd<0?NULL:fdopendir(scanfd);if(!d){if(scanfd>=0)close(scanfd);return fail(ioerr());}unsigned seen=0,count=0,skipped=0;int more=0,limited=0;
  used=0;append("{\"ok\":true,\"mode\":\"%s\",\"entries\":[",mode);
  struct dirent *e;errno=0;while((e=readdir(d))){if(!strcmp(e->d_name,".")||!strcmp(e->d_name,".."))continue;if(seen>=10000){limited=1;break;}seen++;if(seen<=offset)continue;if(denied(e->d_name))continue;
   if(count>=200||used+strlen(e->d_name)*2+160>=sizeof output){more=1;seen--;break;}
   struct stat st;if(fstatat(fd,e->d_name,&st,AT_SYMLINK_NOFOLLOW)){closedir(d);return fail("DIRECTORY_CHANGED");}if((!S_ISREG(st.st_mode)&&!S_ISDIR(st.st_mode))||st.st_dev!=before.st_dev||(S_ISREG(st.st_mode)&&st.st_nlink!=1)){skipped++;continue;}
   append("%s{\"nameHex\":\"",count?",":"");hex((unsigned char*)e->d_name,strlen(e->d_name));append("\",\"kind\":\"%s\",\"size\":%llu}",S_ISDIR(st.st_mode)?"directory":"file",(unsigned long long)st.st_size);count++;errno=0;
  }int saved=errno;closedir(d);if(saved)return fail("RUNTIME_FAILED");struct stat after;if(fstat(fd,&after)||!unchanged(before,after))return fail("DIRECTORY_CHANGED");
#ifdef __APPLE__
  long mn=before.st_mtimespec.tv_nsec,cn=before.st_ctimespec.tv_nsec;
#else
  long mn=before.st_mtim.tv_nsec,cn=before.st_ctim.tv_nsec;
#endif
  append("],\"offset\":%u,\"more\":%s,\"limited\":%s,\"skipped\":%u,\"dev\":\"%llu\",\"ino\":\"%llu\",\"stamp\":\"%llu:%ld:%llu:%ld\"}",seen,more?"true":"false",limited?"true":"false",skipped,(unsigned long long)before.st_dev,(unsigned long long)before.st_ino,(unsigned long long)before.st_mtime,mn,(unsigned long long)before.st_ctime,cn);
 }
 /* Verify root and walked name still bind to the observed inodes, then publish.
  * This detects common races; it is NOT an atomic snapshot or proof against a
  * same-user attacker restoring names between checks. No such claim is made.
  */
 struct stat now;int again=walk(rootfd,rel,!strcmp(op,"list"));
 if(again<0)return fail("FILE_CHANGED");int changed=fstat(again,&now)||!unchanged(before,now);close(again);if(changed)return fail("FILE_CHANGED");
 if(lstat(root,&now)||!same(rs,now)||!S_ISDIR(now.st_mode))return fail("PROJECT_UNAVAILABLE");
 if(output_failed||used>=sizeof output)return fail("RUNTIME_FAILED");fwrite(output,1,used,stdout);putchar('\n');return 0;
}
static int operation(int rootfd,struct stat rs,const char *root,const char *op,const char *rel,unsigned long offset){
 int result=operation_inner(rootfd,rs,root,op,rel,offset);
 if(operation_fd>=0)close(operation_fd);operation_fd=-1;return result;
}
int main(void) {
 /* Close inherited descriptors before confinement. Only stdin/out/err survive. */
 if(close_inherited())return fail("BOUNDARY_UNSUPPORTED");
 char op[16],roothex[32769],relhex[8195],extra[96],root[16385],rel[4098];
 if(!fgets(op,sizeof op,stdin)||!fgets(roothex,sizeof roothex,stdin)||!fgets(relhex,sizeof relhex,stdin)||!fgets(extra,sizeof extra,stdin))return fail("INVALID_REQUEST");
 op[strcspn(op,"\n")]=0;roothex[strcspn(roothex,"\n")]=0;relhex[strcspn(relhex,"\n")]=0;extra[strcspn(extra,"\n")]=0;
 if(decode(roothex,root,sizeof root)||decode(relhex,rel,sizeof rel))return fail("INVALID_REQUEST");
 if(strcmp(op,"list")&&strcmp(op,"read")&&strcmp(op,"session"))return fail("INVALID_REQUEST");
 const char *bad=valid(rel);if(bad)return fail(bad);
 if(!strcmp(op,"read")&&!strcmp(rel,"."))return fail("NOT_REGULAR_FILE");
 if(!*root||root[0]!='/')return fail("PATH_DENIED");
 char canonical[16385];if(!realpath(root,canonical)||strcmp(root,canonical))return fail("PROJECT_UNAVAILABLE");
 if(!root_allowed(root))return fail("PROJECT_UNAVAILABLE");
 if(close_inherited())return fail("BOUNDARY_UNSUPPORTED");
 int rootfd=open(root,O_RDONLY|O_DIRECTORY|O_NOFOLLOW|O_CLOEXEC);if(rootfd<0)return fail("PROJECT_UNAVAILABLE");struct stat rs;if(fstat(rootfd,&rs))return fail("PROJECT_UNAVAILABLE");
 unsigned long offset;unsigned long long expectedDev,expectedIno;char trailing;
 if(sscanf(extra,"%lu %llu %llu %c",&offset,&expectedDev,&expectedIno,&trailing)!=3||offset>10000)return fail("INVALID_REQUEST");
 if((unsigned long long)rs.st_dev!=expectedDev||(unsigned long long)rs.st_ino!=expectedIno)return fail("PROJECT_UNAVAILABLE");
 if(confine(rootfd,root))return fail("BOUNDARY_UNSUPPORTED");
 if(!strcmp(op,"session")){
  /* One immutable project root/sandbox per job. No caller-supplied roots after
   * startup; bounded request frames, serial operations, no mutation methods. */
  while(fgets(op,sizeof op,stdin)){
   if(!strchr(op,'\n')||!fgets(relhex,sizeof relhex,stdin)||!strchr(relhex,'\n')||!fgets(extra,sizeof extra,stdin)||!strchr(extra,'\n'))return fail("INVALID_REQUEST");
   op[strcspn(op,"\n")]=0;relhex[strcspn(relhex,"\n")]=0;extra[strcspn(extra,"\n")]=0;
   if(decode(relhex,rel,sizeof rel)||sscanf(extra,"%lu %c",&offset,&trailing)!=1||offset>10000)return fail("INVALID_REQUEST");
   if(strcmp(op,"list")&&strcmp(op,"read"))return fail("INVALID_REQUEST");
   const char *err=valid(rel);if(err){fail(err);fflush(stdout);continue;}
   operation(rootfd,rs,root,op,rel,offset);fflush(stdout);
   /* Dispose per-operation descriptors on every success/error path while
    * retaining only the root capability and the three stdio pipes. */
   /* operation() tracks and closes its transient fds through its wrapper. */
  }
  close(rootfd);return 0;
 }
 int result=operation(rootfd,rs,root,op,rel,offset);close(rootfd);return result;
}
