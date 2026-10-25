import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import json from 'highlight.js/lib/languages/json';
import css from 'highlight.js/lib/languages/css';
import xml from 'highlight.js/lib/languages/xml';
import markdown from 'highlight.js/lib/languages/markdown';
import yaml from 'highlight.js/lib/languages/yaml';
for(const [name,grammar] of Object.entries({javascript,typescript,json,css,xml,markdown,yaml}))hljs.registerLanguage(name,grammar);
const languages:Record<string,string>={js:'javascript',jsx:'javascript',mjs:'javascript',cjs:'javascript',ts:'typescript',tsx:'typescript',json:'json',css:'css',scss:'css',html:'xml',svg:'xml',xml:'xml',md:'markdown',yml:'yaml',yaml:'yaml'};
export function highlightSource(content:string,fileOrLanguage:string){
 const hint=fileOrLanguage.toLowerCase().split('.').at(-1)||'';
 const language=languages[hint] || (hljs.getLanguage(hint)?hint:undefined);
 if(language)return hljs.highlight(content,{language,ignoreIllegals:true}).value;
 return content.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
}
