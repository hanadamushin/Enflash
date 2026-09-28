const $ = id => document.getElementById(id);
const el = Object.fromEntries(['file-input','file-name','drop-zone','source-text','word-count','sample-btn','status','stage-hint','current-chunk','position','time-left','seek','back-btn','play-btn','forward-btn','chunk-mode','mode-label','speed','speed-output','show-source'].map(id => [id,$(id)]));
// Original text written for Enflash; freely reusable as an in-app sample.
const sample = `When we learn a new language, we often try to understand every word before moving on. However, fluent readers usually process small groups of words as they appear. They connect each new idea to the one before it, even when a sentence is long. This does not mean that they never look back. It means they can choose when to slow down, and when to keep reading.`;
let chunks=[], index=0, playing=false, timer=null, busy=false;
const wordCount = s => (s.match(/\b[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*\b/gu)||[]).length;
function setStatus(message,error=false){el.status.textContent=message;el.status.classList.toggle('error',error)}
function tokenize(text){return text.match(/\S+/g)||[]}
function makeChunks(text,mode){
  const words=tokenize(text.replace(/\r/g,'').replace(/([\p{L}])-[ \t]*\n[ \t]*([\p{L}])/gu,'$1$2').replace(/\s+/g,' ').trim());
  if(mode==='word')return words;
  const out=[];let current=[];
  for(let i=0;i<words.length;i++){
    const token=words[i];
    current.push(token);
    const ending=/[.!?]["”’')\]]*$/.test(token), pause=/[,;:]["”’')\]]*$/.test(token);
    const nextIsConnector=/^(and|but|or|because|although|while|when|which|that|who|if|so)$/i.test(words[i+1]||'');
    if(ending||pause&&current.length>=2||current.length>=6||current.length>=3&&nextIsConnector){out.push(current.join(' '));current=[]}
  }
  if(current.length)out.push(current.join(' '));
  return out;
}
function stop(){playing=false;clearTimeout(timer);el['play-btn'].innerHTML='▶ <span>再生</span>';el['play-btn'].setAttribute('aria-label','再生')}
function render(){
  const n=chunks.length;const has=n>0;
  el['play-btn'].disabled=!has;
  el['stage-hint'].hidden=has;
  el['current-chunk'].textContent=has?chunks[Math.min(index,n-1)]:'';
  el.position.textContent=has?`${Math.min(index+1,n)} / ${n}`:'0 / 0';
  el.seek.max=Math.max(n-1,1);el.seek.value=has?Math.min(index,n-1):0;el.seek.disabled=!has;
  const remaining=has?chunks.slice(index).reduce((total,c)=>total+Math.max(1,wordCount(c)),0):0;
  const seconds=Math.ceil(remaining/Number(el.speed.value)*60);
  el['time-left'].textContent=`約 ${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
}
function rebuild(){stop();const text=el['source-text'].value;el['word-count'].textContent=`${wordCount(text)} words`;chunks=makeChunks(text,el['chunk-mode'].value);index=0;el['mode-label'].textContent=el['chunk-mode'].value==='chunk'?'チャンク':'単語';render();if(!busy)setStatus(chunks.length?'準備完了。再生を押してください。':'英文を入力すると再生できます。')}
function advance(){if(!playing)return;if(index>=chunks.length-1){stop();setStatus('読み終わりました。内容を説明できるか確認してみましょう。');return}index++;render();schedule()}
function schedule(){clearTimeout(timer);if(!playing)return;const c=chunks[index];const n=Math.max(1,wordCount(c));const seconds=60*n/Number(el.speed.value);const punctuation=/[.!?]["”’')\]]*$/.test(c)?300:/[,;:]["”’')\]]*$/.test(c)?160:0;timer=setTimeout(advance,Math.max(260,seconds*1000)+punctuation)}
function toggle(){if(!chunks.length)return;if(playing){stop();return}if(index>=chunks.length-1)index=0;playing=true;el['play-btn'].innerHTML='Ⅱ <span>一時停止</span>';el['play-btn'].setAttribute('aria-label','一時停止');render();schedule()}
function move(delta){if(!chunks.length)return;index=Math.max(0,Math.min(chunks.length-1,index+delta));render();schedule()}
el['source-text'].addEventListener('input',rebuild);
el['chunk-mode'].addEventListener('change',rebuild);
el.speed.addEventListener('input',()=>{el['speed-output'].textContent=`${el.speed.value} WPM`;render();schedule()});
el['play-btn'].addEventListener('click',toggle);
el['back-btn'].addEventListener('click',()=>move(-1));el['forward-btn'].addEventListener('click',()=>move(1));
el.seek.addEventListener('input',()=>{index=Number(el.seek.value);render();schedule()});
el['sample-btn'].addEventListener('click',()=>{el['source-text'].value=sample;el['file-name'].textContent='オリジナル例文';rebuild()});
el['show-source'].addEventListener('click',()=>{el['source-text'].scrollIntoView({behavior:'smooth',block:'center'});el['source-text'].focus()});
document.addEventListener('keydown',e=>{if(['TEXTAREA','INPUT','SELECT','BUTTON'].includes(document.activeElement.tagName)||e.altKey||e.metaKey||e.ctrlKey)return;if(e.code==='Space'){e.preventDefault();toggle()}else if(e.code==='ArrowLeft'){e.preventDefault();move(-1)}else if(e.code==='ArrowRight'){e.preventDefault();move(1)}});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&playing)stop()});
for(const name of ['dragenter','dragover'])el['drop-zone'].addEventListener(name,e=>{e.preventDefault();el['drop-zone'].classList.add('dragover')});
for(const name of ['dragleave','drop'])el['drop-zone'].addEventListener(name,e=>{e.preventDefault();el['drop-zone'].classList.remove('dragover')});
el['drop-zone'].addEventListener('drop',e=>{if(e.dataTransfer.files[0])loadFile(e.dataTransfer.files[0])});
el['file-input'].addEventListener('change',e=>{if(e.target.files[0])loadFile(e.target.files[0]);e.target.value='' });
async function ocr(input,label){if(!window.Tesseract)throw new Error('文字認識ライブラリを読み込めませんでした。通信を確認してください。');setStatus(`${label}：英語の文字認識データを準備しています…`);const worker=await window.Tesseract.createWorker('eng');try{setStatus(`${label}：文字を認識しています…`);const result=await worker.recognize(input);return result.data.text||''}finally{await worker.terminate()}}
async function extractPdf(file){
  let pdfjs;
  try{pdfjs=await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs')}catch{throw new Error('PDF読み込みライブラリを読み込めませんでした。通信を確認してください。')}
  pdfjs.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';
  const documentTask=pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer())});const pdf=await documentTask.promise;const pages=[];
  try{for(let i=1;i<=pdf.numPages;i++){
    setStatus(`PDF ${i} / ${pdf.numPages} ページを読み取っています…`);
    const page=await pdf.getPage(i);const content=await page.getTextContent();
    let text='';for(const item of content.items){if(!item.str)continue;text+=item.str+(item.hasEOL?'\n':' ')}
    if(wordCount(text)<12){const viewport=page.getViewport({scale:2});const canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);const ctx=canvas.getContext('2d');await page.render({canvasContext:ctx,viewport}).promise;text=await ocr(canvas,`PDF ${i} / ${pdf.numPages} ページ`);canvas.width=canvas.height=0}
    pages.push(text.trim());page.cleanup();
  }}finally{await pdf.destroy()}
  return pages.filter(Boolean).join('\n\n');
}
async function loadFile(file){
  if(busy)return;
  const pdf=file.type==='application/pdf'||/\.pdf$/i.test(file.name),image=file.type.startsWith('image/'),plain=file.type==='text/plain'||/\.txt$/i.test(file.name);
  if(!pdf&&!image&&!plain){setStatus('PDF、画像、TXTファイルを選んでください。',true);return}
  busy=true;stop();el['file-name'].textContent=file.name;el['play-btn'].disabled=true;
  try{setStatus(`${file.name} を読み込んでいます…`);const text=pdf?await extractPdf(file):image?await ocr(file,'画像'):await file.text();if(!text.trim())throw new Error('文字を抽出できませんでした。別の画像を試すか、英文を貼り付けてください。');el['source-text'].value=text;rebuild();setStatus(`${file.name} を読み込みました。英文を確認・修正してから再生できます。`)}catch(e){setStatus(e.message||'読み取りに失敗しました。',true);render()}finally{busy=false;render()}
}
el['source-text'].value=sample;
el['file-name'].textContent='オリジナル例文';
rebuild();
