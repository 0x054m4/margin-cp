import { CognitoIdentityProviderClient, ListUsersCommand, AdminListGroupsForUserCommand, AdminGetUserCommand, AdminEnableUserCommand, AdminDisableUserCommand } from '@aws-sdk/client-cognito-identity-provider';
import { z } from 'zod';
const failure=(status,message)=>Object.assign(new Error(message),{status});
export function createAdminService({client=new CognitoIdentityProviderClient({}),pool=process.env.USER_POOL_ID,local=false}={}) {
 const input=Username=>({UserPoolId:pool,Username});
 async function isAdmin(username){
  if(local)return true;
  let NextToken;
  do {const page=await client.send(new AdminListGroupsForUserCommand({...input(username),NextToken}));if(page.Groups?.some(g=>g.GroupName==='administrators'))return true;NextToken=page.NextToken;}while(NextToken);
  return false;
 }
 return {
  async authorize(username){
   if(local)return true;
   try {const user=await client.send(new AdminGetUserCommand(input(username)));return user.Enabled===true&&await isAdmin(username);}catch(e){if(e.name==='UserNotFoundException')return false;throw e;}
  },
  async list(cursor){
   const token=z.string().min(1).max(4096).optional().parse(cursor);
   if(local)return {users:[{username:'local-reader',email:'Local reader',enabled:true,status:'LOCAL',createdAt:null}],nextToken:null};
   const page=await client.send(new ListUsersCommand({UserPoolId:pool,Limit:20,PaginationToken:token}));
   return {users:(page.Users||[]).map(u=>({username:u.Username,email:u.Attributes?.find(a=>a.Name==='email')?.Value||'',enabled:u.Enabled,status:u.UserStatus,createdAt:u.UserCreateDate?.toISOString()||null})),nextToken:page.PaginationToken||null};
  },
  async setEnabled(actor,username,body){
   z.string().min(1).max(128).parse(username);const {enabled}=z.object({enabled:z.boolean()}).strict().parse(body);
   if(local)throw failure(409,'Account changes require the AWS deployment');
   if(actor===username)throw failure(409,'You cannot change your own account access');
   if(!enabled&&await isAdmin(username))throw failure(409,'Administrator accounts must be managed through AWS');
   try{await client.send(new (enabled?AdminEnableUserCommand:AdminDisableUserCommand)(input(username)));}catch(e){if(e.name==='UserNotFoundException')throw failure(404,'Account not found');throw e;}
   return {enabled};
  }
 };
}
