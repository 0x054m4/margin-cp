import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, GetCommand, PutCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
export function createStore({table=process.env.TABLE_NAME, file=process.env.DATA_FILE || resolve('data/library.json')}={}) {
  const db=table ? DynamoDBDocumentClient.from(new DynamoDBClient({})) : null;
  let queue=Promise.resolve();
  async function local(){try{return JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return {};throw e;}}
  function mutate(fn){const operation=queue.then(async()=>{const data=await local();fn(data);await mkdir(dirname(file),{recursive:true});await writeFile(file+'.tmp',JSON.stringify(data,null,2));await rename(file+'.tmp',file);});queue=operation.catch(()=>{});return operation;}
  return {
    async list(pk){if(!db){await queue;return Object.values(await local()).filter(x=>x.pk===pk);}let items=[], key;do{const r=await db.send(new QueryCommand({TableName:table,KeyConditionExpression:'pk = :pk',ExpressionAttributeValues:{':pk':pk},ExclusiveStartKey:key,ConsistentRead:true}));items.push(...r.Items);key=r.LastEvaluatedKey;}while(key);return items;},
    async get(pk,sk){if(db)return (await db.send(new GetCommand({TableName:table,Key:{pk,sk},ConsistentRead:true}))).Item;await queue;return (await local())[pk+'|'+sk];},
    async put(item){if(db)await db.send(new PutCommand({TableName:table,Item:item}));else await mutate(d=>{d[item.pk+'|'+item.sk]=item;});return item;},
    async remove(pk,sk){if(db)await db.send(new DeleteCommand({TableName:table,Key:{pk,sk}}));else await mutate(d=>{delete d[pk+'|'+sk];});}
  };
}
