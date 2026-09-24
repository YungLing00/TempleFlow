import {createServer} from 'node:http';
import {readFile, stat} from 'node:fs/promises';
import {resolve, extname} from 'node:path';
import handler from './api/index.js';
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};
createServer(async(req,res)=>{
  res.status=function(code){res.statusCode=code;return res};
  res.json=function(data){res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(data));return res};
  if(req.url.startsWith('/api/')){
    try{
      const chunks=[];for await(const chunk of req){chunks.push(chunk);if(Buffer.concat(chunks).length>8192){res.status(413).json({error:'資料過大'});return}}
      req.body=chunks.length?JSON.parse(Buffer.concat(chunks).toString()):{};
    }catch{res.status(400).json({error:'JSON 格式錯誤'});return}
    return handler(req,res);
  }
  const path=new URL(req.url,'http://localhost').pathname;
  const name=path==='/'?'index.html':path.slice(1);
  if(!['index.html','app.js','config.js'].includes(name)){res.statusCode=404;res.end('Not Found');return}
  try{
    const file=resolve(name);await stat(file);
    res.setHeader('Content-Type',types[extname(file)]||'text/plain');
    res.end(await readFile(file));
  }catch{res.statusCode=404;res.end('Not Found')}
}).listen(process.env.PORT||3000,()=>console.log('TempleFlow: http://localhost:'+(process.env.PORT||3000)));
