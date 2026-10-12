const validProject = id => /^vm-[a-z0-9]+$/.test(id || '');
const validRelease = id => /^[a-f0-9-]{36}$/.test(id || '');
const validPath = path => path && path.length < 2048 && !path.includes('\\') && !path.includes('\0') && path.split('/').every(p => p && p !== '.' && p !== '..' && !p.startsWith('.env'));
const mime = path => ({html:'text/html; charset=utf-8',js:'text/javascript; charset=utf-8',css:'text/css; charset=utf-8',json:'application/json',txt:'text/plain; charset=utf-8',svg:'image/svg+xml',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',ico:'image/x-icon',woff:'font/woff',woff2:'font/woff2',mp3:'audio/mpeg',wav:'audio/wav',wasm:'application/wasm'})[path.split('.').pop()] || 'application/octet-stream';
export default {
  async fetch(request, env) {
    if (!env.BUCKET) return new Response('Storage unavailable', {status:503});
    const url = new URL(request.url);
    let parts; try {parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);} catch {return new Response('Invalid path',{status:400});}
    if (parts[0] === '__publish') {
      if (!env.PUBLISH_TOKEN || request.headers.get('authorization') !== `Bearer ${env.PUBLISH_TOKEN}`) return new Response('Unauthorized', {status:401});
      const [,project,release,action,...rest] = parts;
      if (!validProject(project) || !validRelease(release)) return new Response('Invalid release',{status:400});
      const prefix = `projects/${project}/releases/${release}/`;
      if (action === 'files' && request.method === 'PUT') {
        const path = rest.join('/'); if (!validPath(path)) return new Response('Invalid file',{status:400});
        const bytes = await request.arrayBuffer(); if(bytes.byteLength > 10*1024*1024) return new Response('File too large',{status:413});
        const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
        await env.BUCKET.put(prefix+path,bytes,{httpMetadata:{contentType:mime(path)},customMetadata:{sha256:digest}});
        return Response.json({ok:true,sha256:digest,size:bytes.byteLength});
      }
      if (action === 'commit' && request.method === 'POST') {
        const manifest = await request.json().catch(()=>null);
        if (!Array.isArray(manifest?.files) || !manifest.files.length || manifest.files.length > 1000 || !manifest.files.some(f=>f.path==='index.html')) return new Response('Invalid manifest',{status:400});
        let total = 0;
        for (const file of manifest.files) {
          if (!validPath(file.path)) return new Response('Invalid file',{status:400});
          const object = await env.BUCKET.head(prefix+file.path);
          if (!object || object.customMetadata?.sha256 !== file.sha256 || object.size !== file.size) return new Response('Incomplete upload',{status:409});
          total += object.size;
        }
        if(total > 50*1024*1024) return new Response('Release too large',{status:413});
        await env.BUCKET.put(prefix+'__manifest.json',JSON.stringify(manifest));
        await env.BUCKET.put(`projects/${project}/current.json`,JSON.stringify({release}));
        return Response.json({ok:true,url:`${url.origin}/p/${project}/r/${release}/`});
      }
      if(action==='activate' && request.method==='POST') {
        if(!await env.BUCKET.head(prefix+'__manifest.json')) return new Response('Release unavailable',{status:404});
        await env.BUCKET.put(`projects/${project}/current.json`,JSON.stringify({release}));
        return Response.json({ok:true});
      }
      return new Response('Unsupported operation',{status:405});
    }
    if (!['GET','HEAD'].includes(request.method)) return new Response('Method not allowed',{status:405});
    const [,project,marker,release,...rest] = parts;
    if(parts[0] !== 'p' || !validProject(project)) return new Response('Published games are available through their project links.',{status:404});
    if(!marker) {
      const current = await env.BUCKET.get(`projects/${project}/current.json`);
      if(!current) return new Response('Not published',{status:404});
      const {release} = await current.json();
      return new Response(null,{status:302,headers:{Location:`/p/${project}/r/${release}/`,'Cache-Control':'no-store'}});
    }
    if(marker!=='r' || !validRelease(release)) return new Response('Invalid release',{status:404});
    const prefix = `projects/${project}/releases/${release}/`;
    if(!await env.BUCKET.head(prefix+'__manifest.json')) return new Response('Not published',{status:404});
    let path = rest.join('/') || 'index.html';
    if(!validPath(path) || path==='__manifest.json') return new Response('Invalid file',{status:404});
    let object = await env.BUCKET.get(prefix+path);
    if(!object && !path.split('/').pop().includes('.')) object = await env.BUCKET.get(prefix+path+'/index.html') || await env.BUCKET.get(prefix+path+'.html');
    if(!object) return new Response('Not found',{status:404});
    const headers = new Headers();object.writeHttpMetadata(headers);
    headers.set('ETag',object.httpEtag);headers.set('Cache-Control','public, max-age=31536000, immutable');
    headers.set('X-Content-Type-Options','nosniff');headers.set('Referrer-Policy','no-referrer');
    return new Response(request.method==='HEAD'?null:object.body,{headers});
  },
};
