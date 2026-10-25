export const activitySetup = `
const fs=require('fs');const root='/workspace';
const script="(()=>{if(window.parent===window)return;let sent=0;const notify=()=>{if(Date.now()-sent<2000)return;sent=Date.now();window.parent.postMessage({type:'dreamforge:preview-activity'},'*');};['pointerdown','keydown','wheel','touchstart'].forEach(event=>window.addEventListener(event,notify,{passive:true}));})();";
fs.mkdirSync(root+'/public',{recursive:true});fs.writeFileSync(root+'/public/adorable-activity.js',script);
for(const name of ['app/layout.tsx','app/layout.jsx','src/app/layout.tsx','src/app/layout.jsx']){
 const file=root+'/'+name;if(!fs.existsSync(file))continue;let content=fs.readFileSync(file,'utf8');
 if(!content.includes('adorable-activity.js')&&content.includes('</body>'))fs.writeFileSync(file,content.replace('</body>','<script src="/adorable-activity.js" defer />\\n</body>'));
}
`;
export const activityCommand = `node -e '${activitySetup.replace(/'/g,"'\\''")}'`;
