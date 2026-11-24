import express from 'express';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
process.env.LOCAL_DEV ??= 'true';
const app=createApp();app.use(express.static(fileURLToPath(new URL('../../frontend',import.meta.url))));
app.listen(process.env.PORT||3000,'127.0.0.1',()=>console.log('Margin: http://localhost:3000 (local development reader)'));
