const { app, BrowserWindow } = require('electron');
const path=require('path');
const http=require('http');
const fs=require('fs');
let server,win;
function mime(p){if(p.endsWith('.js'))return'application/javascript';if(p.endsWith('.json'))return'application/json';if(p.endsWith('.css'))return'text/css';if(p.endsWith('.png'))return'image/png';return'text/html';}
function serve(){return new Promise((resolve,reject)=>{server=http.createServer((req,res)=>{let u=decodeURIComponent(req.url.split('?')[0]);if(u==='/' )u='/index.html';const fp=path.join(__dirname,u);if(!fp.startsWith(__dirname)||!fs.existsSync(fp)){res.writeHead(404);return res.end('Not found')}res.writeHead(200,{'Content-Type':mime(fp),'Cache-Control':'no-store'});res.end(fs.readFileSync(fp));});server.once('error',reject);server.listen(0,'127.0.0.1',()=>resolve(server.address().port));});}
async function main(){const port=await serve();win=new BrowserWindow({width:1600,height:1000,minWidth:1180,minHeight:760,backgroundColor:'#020203',autoHideMenuBar:true,title:'Medical Deathmatch — Studio Edition',webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true}});await win.loadURL(`http://127.0.0.1:${port}/index.html`);}
app.whenReady().then(main);app.on('window-all-closed',()=>{server?.close();if(process.platform!=='darwin')app.quit()});app.on('before-quit',()=>server?.close());
