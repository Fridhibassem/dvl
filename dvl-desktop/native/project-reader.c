/* DVL C1 boundary prototype. No provider, mutation or shell API.
 * One request per short-lived process. All output is buffered until identity
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
#ifdef __APPLE__
#include <sandbox.h>
#elif defined(__linux__)
#include <linux/landlock.h>
#include <sys/syscall.h>
#include <sys/prctl.h>
#endif

#define MAX_READ (1024*1024)
#define MAX_OUT (2*1024*1024+4096)
static char output[MAX_OUT];
static size_t used;
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
static void hex(const unsigned char *b,size_t n) { static const char *h="0123456789abcdef"; for(size_t i=0;i<n;i++){output[used++]=h[b[i]>>4];output[used++]=h[b[i]&15];} }
static int decode(const char *s,char *out,size_t cap) {
 size_t n=strlen(s);if(n%2||n/2>=cap)return -1;
 for(size_t i=0;i<n;i+=2){if(!isxdigit((unsigned char)s[i])||!isxdigit((unsigned char)s[i+1]))return -1;unsigned x;sscanf(s+i,"%2x",&x);if(!x)return -1;out[i/2]=(char)x;}out[n/2]=0;return 0;
}
static int denied(const char *s) {
 char b[4096];size_t n=strlen(s);if(n>=sizeof b)return 1;for(size_t i=0;i<=n;i++)b[i]=(char)tolower((unsigned char)s[i]);
 const char *dirs[]={".git",".dvl",".ssh",".gnupg",".aws",".azure",".kube",NULL};
 for(int i=0;dirs[i];i++)if(!strcmp(b,dirs[i]))return 1;
 const char *files[]={".env",".npmrc",".pypirc",".netrc","credentials","credentials.json",NULL};
 for(int i=0;files[i];i++)if(!strcmp(b,files[i]))return 1;
 if(!strncmp(b,".env.",5)||!strncmp(b,"id_rsa",6)||!strncmp(b,"id_ed25519",10))return 1;
 const char *ext=strrchr(b,'.');return ext&&(!strcmp(ext,".pem")||!strcmp(ext,".key")||!strcmp(ext,".p12")||!strcmp(ext,".pfx"));
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
 /* Escape exact canonical root as a Seatbelt string, never interpolate code. */
 char quoted[32768];size_t n=0;
 for(const unsigned char *p=(const unsigned char*)root;*p;p++){if(*p<32||*p==127)return -1;if(*p=='"'||*p=='\\')quoted[n++]='\\';quoted[n++]=(char)*p;if(n>sizeof(quoted)-8)return -1;}quoted[n]=0;
 char profile[34000];snprintf(profile,sizeof profile,"(version 1)(deny default)(allow file-read* (subpath \"%s\"))",quoted);
 char *error=NULL;int r=sandbox_init(profile,0,&error);if(error)sandbox_free_error(error);if(r)return -1;mode="seatbelt";
#elif defined(__linux__)
 (void)root;
 struct landlock_ruleset_attr rules={.handled_access_fs=LANDLOCK_ACCESS_FS_EXECUTE|LANDLOCK_ACCESS_FS_WRITE_FILE|LANDLOCK_ACCESS_FS_READ_FILE|LANDLOCK_ACCESS_FS_READ_DIR|LANDLOCK_ACCESS_FS_REMOVE_DIR|LANDLOCK_ACCESS_FS_REMOVE_FILE|LANDLOCK_ACCESS_FS_MAKE_CHAR|LANDLOCK_ACCESS_FS_MAKE_DIR|LANDLOCK_ACCESS_FS_MAKE_REG|LANDLOCK_ACCESS_FS_MAKE_SOCK|LANDLOCK_ACCESS_FS_MAKE_FIFO|LANDLOCK_ACCESS_FS_MAKE_BLOCK|LANDLOCK_ACCESS_FS_MAKE_SYM};
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
static const char *ioerr(void) { switch(errno){case ENOENT:return "NOT_FOUND";case EACCES:case EPERM:return "PERMISSION_DENIED";case ELOOP:return "SYMLINK_DENIED";case ENOTDIR:return "PATH_DENIED";default:return "RUNTIME_FAILED";} }
/* Each parent anchored in an fd, no path concatenation for actual opens. */
static int walk(int rootfd,const char *rel,int directory) {
 int fd=dup(rootfd);if(fd<0)return -1;if(!strcmp(rel,"."))return fd;
 char b[4097];strcpy(b,rel);char *save=NULL,*s=strtok_r(b,"/",&save);
 while(s){char *next=strtok_r(NULL,"/",&save);int nf=openat(fd,s,O_RDONLY|O_NOFOLLOW|O_NONBLOCK|O_CLOEXEC|((next||directory)?O_DIRECTORY:0));int e=errno;close(fd);errno=e;if(nf<0)return -1;fd=nf;s=next;}return fd;
}
int main(void) {
 /* Close inherited descriptors before confinement. Only stdin/out/err survive. */
 struct rlimit lim;if(getrlimit(RLIMIT_NOFILE,&lim))return fail("RUNTIME_FAILED");
#ifdef __APPLE__
 if(lim.rlim_cur==RLIM_INFINITY||lim.rlim_cur>2147483647ULL)return fail("BOUNDARY_UNSUPPORTED");
 for(rlim_t fd=3;fd<lim.rlim_cur;fd++)close((int)fd);
#else
 if(syscall(SYS_close_range,3U,~0U,0)!=0)for(unsigned long i=3;i<lim.rlim_cur;i++)close((int)i);
#endif
 char op[16],roothex[32769],relhex[8195],extra[96],root[16385],rel[4098];
 if(!fgets(op,sizeof op,stdin)||!fgets(roothex,sizeof roothex,stdin)||!fgets(relhex,sizeof relhex,stdin)||!fgets(extra,sizeof extra,stdin))return fail("INVALID_REQUEST");
 op[strcspn(op,"\n")]=0;roothex[strcspn(roothex,"\n")]=0;relhex[strcspn(relhex,"\n")]=0;extra[strcspn(extra,"\n")]=0;
 if(decode(roothex,root,sizeof root)||decode(relhex,rel,sizeof rel))return fail("INVALID_REQUEST");
 if(strcmp(op,"list")&&strcmp(op,"read"))return fail("INVALID_REQUEST");
 const char *bad=valid(rel);if(bad)return fail(bad);
 if(!strcmp(op,"read")&&!strcmp(rel,"."))return fail("NOT_REGULAR_FILE");
 if(!*root||root[0]!='/'||!strcmp(root,"/")||!strcmp(root,"/etc")||!strcmp(root,"/private/etc"))return fail("PATH_DENIED");
 char canonical[16385];if(!realpath(root,canonical)||strcmp(root,canonical))return fail("PROJECT_UNAVAILABLE");
 int rootfd=open(root,O_RDONLY|O_DIRECTORY|O_NOFOLLOW|O_CLOEXEC);if(rootfd<0)return fail("PROJECT_UNAVAILABLE");struct stat rs;if(fstat(rootfd,&rs))return fail("PROJECT_UNAVAILABLE");
 unsigned long offset;unsigned long long expectedDev,expectedIno;char trailing;
 if(sscanf(extra,"%lu %llu %llu %c",&offset,&expectedDev,&expectedIno,&trailing)!=3||offset>10000)return fail("INVALID_REQUEST");
 if((unsigned long long)rs.st_dev!=expectedDev||(unsigned long long)rs.st_ino!=expectedIno)return fail("PROJECT_UNAVAILABLE");
 if(confine(rootfd,root))return fail("BOUNDARY_UNSUPPORTED");
 int fd=walk(rootfd,rel,!strcmp(op,"list"));if(fd<0)return fail(ioerr());struct stat before;if(fstat(fd,&before))return fail("RUNTIME_FAILED");
 if(!strcmp(op,"read")){
  if(!S_ISREG(before.st_mode))return fail("NOT_REGULAR_FILE");if(before.st_nlink!=1)return fail("HARDLINK_DENIED");if(before.st_size>MAX_READ)return fail("FILE_TOO_LARGE");
  static unsigned char bytes[MAX_READ+1];size_t n=0;while(n<sizeof bytes){ssize_t r=read(fd,bytes+n,sizeof bytes-n);if(r<0){if(errno==EINTR)continue;return fail(ioerr());}if(!r)break;n+=(size_t)r;}if(n>MAX_READ)return fail("FILE_TOO_LARGE");
  struct stat after;if(fstat(fd,&after)||!unchanged(before,after)||after.st_nlink!=1)return fail("FILE_CHANGED");
  used=(size_t)snprintf(output,sizeof output,"{\"ok\":true,\"mode\":\"%s\",\"hex\":\"",mode);hex(bytes,n);used+=(size_t)snprintf(output+used,sizeof output-used,"\",\"bytes\":%zu,\"dev\":%llu,\"ino\":%llu}",n,(unsigned long long)before.st_dev,(unsigned long long)before.st_ino);
 }else{
  DIR *d=fdopendir(dup(fd));if(!d)return fail(ioerr());unsigned seen=0,count=0;int more=0,limited=0;
  used=(size_t)snprintf(output,sizeof output,"{\"ok\":true,\"mode\":\"%s\",\"entries\":[",mode);
  struct dirent *e;errno=0;while((e=readdir(d))){if(!strcmp(e->d_name,".")||!strcmp(e->d_name,".."))continue;if(seen>=10000){limited=1;break;}seen++;if(seen<=offset)continue;if(denied(e->d_name))continue;
   if(count>=200||used+strlen(e->d_name)*2+160>=sizeof output){more=1;seen--;break;}
   struct stat st;if(fstatat(fd,e->d_name,&st,AT_SYMLINK_NOFOLLOW)){closedir(d);return fail("DIRECTORY_CHANGED");}if(!S_ISREG(st.st_mode)&&!S_ISDIR(st.st_mode))continue;if(S_ISREG(st.st_mode)&&st.st_nlink!=1)continue;
   used+=(size_t)snprintf(output+used,sizeof output-used,"%s{\"nameHex\":\"",count?",":"");hex((unsigned char*)e->d_name,strlen(e->d_name));used+=(size_t)snprintf(output+used,sizeof output-used,"\",\"kind\":\"%s\",\"size\":%llu}",S_ISDIR(st.st_mode)?"directory":"file",(unsigned long long)st.st_size);count++;errno=0;
  }int saved=errno;closedir(d);if(saved)return fail("RUNTIME_FAILED");struct stat after;if(fstat(fd,&after)||!unchanged(before,after))return fail("DIRECTORY_CHANGED");
#ifdef __APPLE__
  long mn=before.st_mtimespec.tv_nsec,cn=before.st_ctimespec.tv_nsec;
#else
  long mn=before.st_mtim.tv_nsec,cn=before.st_ctim.tv_nsec;
#endif
  used+=(size_t)snprintf(output+used,sizeof output-used,"],\"offset\":%u,\"more\":%s,\"limited\":%s,\"dev\":%llu,\"ino\":%llu,\"stamp\":\"%llu:%ld:%llu:%ld\"}",seen,more?"true":"false",limited?"true":"false",(unsigned long long)before.st_dev,(unsigned long long)before.st_ino,(unsigned long long)before.st_mtime,mn,(unsigned long long)before.st_ctime,cn);
 }
 /* Verify root and walked name still bind to the observed inodes, then publish.
  * This detects common races; it is NOT an atomic snapshot or proof against a
  * same-user attacker restoring names between checks. No such claim is made.
  */
 struct stat now;int again=walk(rootfd,rel,!strcmp(op,"list"));
 if(again<0||fstat(again,&now)||!unchanged(before,now))return fail("FILE_CHANGED");close(again);
 if(lstat(root,&now)||!same(rs,now)||!S_ISDIR(now.st_mode))return fail("PROJECT_UNAVAILABLE");
 close(fd);close(rootfd);if(used>=sizeof output)return fail("RUNTIME_FAILED");fwrite(output,1,used,stdout);putchar('\n');return 0;
}
