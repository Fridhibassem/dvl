/* Test binary ONLY: adversarial raw syscalls bypass production path policy.
 * No test entrypoints are built into the production reader executable. */
#define main production_reader_main
#include "../native/project-reader.c"
#undef main
int main(int argc,char **argv) {
 if(argc!=4)return 2;
 int rootfd=open(argv[1],O_RDONLY|O_DIRECTORY|O_NOFOLLOW);if(rootfd<0)return 2;
 int held=openat(rootfd,"moving",O_RDONLY|O_DIRECTORY|O_NOFOLLOW);if(held<0)return 2;
 if(confine(rootfd,argv[1])){puts("UNSUPPORTED");return 3;}
 printf("READY %s\n",mode);fflush(stdout);
 if(getchar()!='x')return 2;
 int external=open(argv[2],O_RDONLY|O_NONBLOCK);int externalDenied=external<0&&(errno==EACCES||errno==EPERM);if(external>=0)close(external);
 int writefd=openat(rootfd,"write-must-not-exist",O_WRONLY|O_CREAT,0600);int writeDenied=writefd<0&&(errno==EACCES||errno==EPERM);if(writefd>=0)close(writefd);
 int moved=openat(held,argv[3],O_RDONLY|O_NOFOLLOW);int movedDenied=moved<0&&(errno==EACCES||errno==EPERM);if(moved>=0)close(moved);
 printf("{\"externalDenied\":%s,\"writeDenied\":%s,\"movedDenied\":%s}\n",externalDenied?"true":"false",writeDenied?"true":"false",movedDenied?"true":"false");return 0;
}
