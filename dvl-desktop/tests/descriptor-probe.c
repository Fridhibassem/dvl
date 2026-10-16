#define main production_reader_main
#include "../native/project-reader.c"
#undef main
int main(void){
 struct rlimit before, lowered;if(getrlimit(RLIMIT_NOFILE,&before))return 2;lowered=before;lowered.rlim_cur=16;
 if(setrlimit(RLIMIT_NOFILE,&lowered))return 2;
 if(close_inherited())return 3;
 int a=fcntl(3,F_GETFD);int ae=errno;int b=fcntl(37,F_GETFD);int be=errno;
 printf("{\"softBefore\":%llu,\"fd3Closed\":%s,\"fd37Closed\":%s}\n",(unsigned long long)before.rlim_cur,a<0&&ae==EBADF?"true":"false",b<0&&be==EBADF?"true":"false");
 return a<0&&ae==EBADF&&b<0&&be==EBADF?0:1;
}
