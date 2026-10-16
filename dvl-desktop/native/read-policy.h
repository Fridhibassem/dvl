/* Generated from read-policy.json; do not hand-edit. */
static const char *policy_deniedNames[]={".git",".dvl",".ssh",".gnupg",".aws",".azure",".kube",".docker",".config",".env",".npmrc",".pypirc",".netrc","credentials","credentials.json",".git-credentials",".pgpass",".vault-token","kubeconfig",".htpasswd",NULL};
static const char *policy_deniedPrefixes[]={".env.","id_rsa","id_ed25519","id_ecdsa","id_dsa",NULL};
static const char *policy_deniedExtensions[]={".pem",".key",".p12",".pfx",".tfstate",".keystore",".jks",NULL};
static const char *policy_rootExact[]={"/","/Users","/home","/private","/Volumes","/Library",NULL};
static const char *policy_rootTrees[]={"/etc","/private/etc","/System","/usr","/bin","/sbin","/dev","/proc","/sys",NULL};
static const char *policy_homeTrees[]={"Library",".config",".local/share",".ssh",".aws",".docker",NULL};
