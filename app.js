'use strict';
const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const icon = name => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const STORAGE_KEY='bookrec-favorites-v1';
const featuredIds=[1,17,210,104];
const featuredMeta={1:{title:'Абай жолы',year:1942,tag:'Роман',cover:0},17:{year:1928,tag:'Психологиялық роман',cover:1},210:{year:1961,tag:'Тарихи роман',cover:2},104:{year:1957,tag:'Повесть',cover:3}};
let backendState=null, readingStatuses={}, latestBackendArgs=null, lastBackendEvent='', restoreAttempted=false, lastBackendError='';
let books=[],similarities=[],favorites=new Set(),activeView='home',page=1,genre='Барлығы',query='',sort='catalog',toastTimer;
try{const stored=JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]');if(Array.isArray(stored))favorites=new Set(stored.filter(Number.isInteger));}catch{}
const perPage=12;
const normalize=text=>text.toLocaleLowerCase('kk').replace(/ё/g,'е').replace(/[^\p{L}\p{N}\s]/gu,' ').replace(/\s+/g,' ').trim();
const getBook=id=>books.find(b=>b.book_id===Number(id));
const displayTitle=b=>featuredMeta[b.book_id]?.title || b.title;
function coverHTML(b){
 const m=featuredMeta[b.book_id];
 if(m)return `<div class="cover cover-${m.cover}" role="img" aria-label="${escapeHTML(displayTitle(b))} кітабының көркем мұқабасы"><div class="cover-art"></div><div class="cover-shade"></div><span class="cover-title">${escapeHTML(displayTitle(b))}</span></div>`;
 const index=b.book_id-1-featuredIds.filter(id=>id<b.book_id).length;
 const sheet=String(Math.floor(index/16)+1).padStart(2,'0'),cell=index%16;
 const position=`${(cell%4)*100/3}% ${Math.floor(cell/4)*100/3}%`;
 return `<div class="cover cover-illustrated${b.title.length>40?' cover-long-title':''}" role="img" aria-label="${escapeHTML(b.title)} кітабының көркем мұқабасы"><div class="cover-art" style="background-image:url('assets/covers/sheet-${sheet}.webp');background-size:400% 400%;background-position:${position}"></div><div class="cover-shade"></div><span class="cover-author">${escapeHTML(b.author)}</span><span class="cover-title">${escapeHTML(b.title)}</span></div>`;
}
function cardHTML(b,score){
 const m=featuredMeta[b.book_id],fav=favorites.has(b.book_id);
 return `<article class="book-card" data-book-id="${b.book_id}">${coverHTML(b)}<button class="favorite-button ${fav?'is-favorite':''}" data-favorite="${b.book_id}" aria-label="${escapeHTML(b.title)}: ${fav?'таңдаулылардан алып тастау':'таңдаулыларға қосу'}" aria-pressed="${fav}">${icon('heart')}</button><div class="book-info"><h3 class="book-title">${escapeHTML(displayTitle(b))}</h3><p class="book-author">${escapeHTML(b.author)}</p><span class="book-tag">${escapeHTML(m?.tag||b.category)}</span><p class="book-year">${m?.year||`${b.pages} бет`}</p>${score!==undefined?`<span class="match-note">Талғамыңызға жақын · ${Math.round(score*100)}%</span>`:''}<button class="details-button" data-details="${b.book_id}">Толығырақ ${icon('arrow')}</button></div></article>`;
}
function notify(text){$('#toast').textContent=text;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),2600);}
function persistFavorites(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify([...favorites]));return true;}catch{notify('Браузерде сақтау мүмкін емес. Таңдау осы бетте ғана сақталады.');return false;}}
function updateFavoriteControls(){
 const count=$('#favorite-count');count.textContent=favorites.size;count.hidden=!favorites.size;
 $$('[data-favorite]').forEach(el=>{const id=Number(el.dataset.favorite),fav=favorites.has(id),b=getBook(id);el.classList.toggle('is-favorite',fav);el.setAttribute('aria-pressed',String(fav));el.setAttribute('aria-label',`${b?.title||''}: ${fav?'таңдаулылардан алып тастау':'таңдаулыларға қосу'}`);if(el.classList.contains('dialog-save'))el.innerHTML=`${icon('heart')} ${fav?'Таңдаулыларда':'Таңдаулыларға қосу'}`;});
}
function toggleFavorite(id){
 if(!getBook(id))return;
 const existed=favorites.has(id);if(existed)favorites.delete(id);else favorites.add(id);
 const saved=persistFavorites();updateFavoriteControls();
 if(activeView==='favorites')renderFavorites();if(activeView==='recommendations')renderRecommendations();
 if(saved)notify(existed?'Кітап таңдаулылардан алынды':'Кітап таңдаулыларға қосылды');
 syncBackend();
}
function renderFavorites(){const chosen=books.filter(b=>favorites.has(b.book_id));$('#favorite-books').innerHTML=chosen.map(b=>cardHTML(b)).join('');renderReadingStatuses();$('#favorites-empty').hidden=chosen.length>0;$('#favorites-summary').hidden=!chosen.length;$('#favorites-total').textContent=`${chosen.length} таңдаулы шығарма`;}
function filteredBooks(){const terms=normalize(query).split(' ').filter(Boolean);let list=books.filter(b=>(genre==='Барлығы'||b.category===genre)&&terms.every(t=>normalize(b.title+' '+b.author).includes(t)));if(sort==='title')list.sort((a,b)=>a.title.localeCompare(b.title,'kk'));if(sort==='author')list.sort((a,b)=>a.author.localeCompare(b.author,'kk'));if(sort==='short')list.sort((a,b)=>a.pages-b.pages);return list;}
function renderCatalog(){
 const list=filteredBooks(),totalPages=Math.ceil(list.length/perPage);page=Math.max(1,Math.min(page,totalPages||1));
 $('#catalog-books').innerHTML=list.slice((page-1)*perPage,page*perPage).map(b=>cardHTML(b)).join('');
 $('#results-count').textContent=`${list.length} шығарма${query?` · «${query}»`:''}`;$('#catalog-empty').hidden=!!list.length;$('#clear-filters').hidden=!query&&genre==='Барлығы';
 $$('#genre-filters button').forEach(b=>{const selected=b.dataset.genre===genre;b.classList.toggle('active',selected);b.setAttribute('aria-pressed',String(selected));});
 let pagination='';if(totalPages>1){pagination=`<button class="page-button" data-page="${page-1}" ${page===1?'disabled':''} aria-label="Алдыңғы бет">‹</button>`;let prev=0;for(let i=1;i<=totalPages;i++)if(i===1||i===totalPages||Math.abs(i-page)<=1){if(prev&&i-prev>1)pagination+='<span>…</span>';pagination+=`<button class="page-button ${i===page?'active':''}" data-page="${i}" ${i===page?'aria-current="page"':''} aria-label="${i}-бет">${i}</button>`;prev=i;}pagination+=`<button class="page-button" data-page="${page+1}" ${page===totalPages?'disabled':''} aria-label="Келесі бет">›</button>`;}$('#pagination').innerHTML=pagination;
}
function rankBooks(ids){
 const indexes=ids.map(id=>books.findIndex(b=>b.book_id===id)).filter(i=>i>=0);
 if(!indexes.length||!similarities.length)return [];
 const magnitude=Math.sqrt(indexes.reduce((sum,i)=>sum+indexes.reduce((s,j)=>s+similarities[i][j],0),0))/(indexes.length);
 return books.map((b,i)=>({book:b,score:indexes.reduce((sum,j)=>sum+similarities[j][i],0)/indexes.length/(magnitude||1)})).filter(x=>!ids.includes(x.book.book_id)).sort((a,b)=>b.score-a.score);
}
function renderRecommendations(){
 const ids=[...favorites],chosen=ids.map(getBook).filter(Boolean);
 if(chosen.length){
 $('#recommendation-explanation').textContent=`Сіз таңдаған ${chosen.length} кітаптың атауы, авторы мен жанрына сүйеніп, жақын шығармаларды таптық.`;
 $('#recommendation-title').textContent='Сізге ұнауы мүмкін';$('#recommendation-count').textContent='12 жеке ұсыныс';
 $('#recommendation-seeds').innerHTML=`<span>Таңдауыңыз:</span>${chosen.slice(0,5).map(b=>`<button class="seed-chip" data-details="${b.book_id}">${escapeHTML(displayTitle(b))}</button>`).join('')}${chosen.length>5?`<span>және тағы ${chosen.length-5} кітап</span>`:''}`;
 const ranked=backendState && sameIds(ids,backendState.favorites) ? backendState.recommendations.map(item=>({book:getBook(item.book_id),score:item.score})).filter(item=>item.book) : rankBooks(ids).slice(0,12);$('#recommended-books').innerHTML=ranked.map(x=>cardHTML(x.book,x.score)).join('');if(!ranked.length)$('#recommended-books').innerHTML='<p>Қалған кітаптар табылмады. Таңдауларыңызды өзгертіп көріңіз.</p>';
 }else{
 $('#recommendation-explanation').textContent='Ұнаған кемінде бір кітабыңызды таңдаңыз. Атауы, авторы мен жанры бойынша жақын шығармаларды ұсынамыз.';
 $('#recommendation-title').textContent='Неден бастауға болады?';$('#recommendation-count').textContent='Редакция таңдауы';$('#recommendation-seeds').innerHTML='';$('#recommended-books').innerHTML=featuredIds.map(getBook).filter(Boolean).map(b=>cardHTML(b)).join('');
 }
}
function showView(){
 const requested=location.hash.slice(1).split('?')[0];activeView=['home','books','favorites','recommendations'].includes(requested)?requested:'home';
 $$('.view').forEach(v=>v.hidden=v.id!==`${activeView}-view`);$$('[data-view]').forEach(a=>{const active=a.dataset.view===activeView;a.classList.toggle('active',active);if(active)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
 if(books.length){if(activeView==='books')renderCatalog();if(activeView==='favorites')renderFavorites();if(activeView==='recommendations')renderRecommendations();}
 const names={home:'Қазақ әдебиеті',books:'Кітаптар',favorites:'Таңдаулылар',recommendations:'Ұсыныстар'};document.title=`BookRec — ${names[activeView]}`;window.scrollTo({top:0,behavior:'instant'});
}
function showDetails(id){
 const b=getBook(id);if(!b)return;const m=featuredMeta[id],fav=favorites.has(id),related=rankBooks([id]).slice(0,3);
 const validUrl=/^https:\/\//.test(b.read_url||'');
 $('#dialog-content').innerHTML=`<div class="dialog-layout">${coverHTML(b)}<div class="dialog-text"><div class="eyebrow">ҚАЗАҚ ӘДЕБИЕТІ</div><h2 id="dialog-title">${escapeHTML(b.title)}</h2><p class="dialog-author">${escapeHTML(b.author)}</p><div class="dialog-meta"><span>${escapeHTML(m?.tag||b.category)}</span><span>${b.pages} бет</span><span>${escapeHTML(b.language)}</span>${m?`<span>${m.year}</span>`:''}</div><p class="dialog-description">${escapeHTML(b.description)}</p><div class="dialog-actions">${validUrl?`<a href="${escapeHTML(b.read_url)}" target="_blank" rel="noopener noreferrer" class="primary-button">Кітапты оқу ${icon('arrow')}</a>`:''}<button class="outline-button dialog-save ${fav?'is-favorite':''}" data-favorite="${id}" aria-pressed="${fav}">${icon('heart')} ${fav?'Таңдаулыларда':'Таңдаулыларға қосу'}</button></div><p class="source-note">Дереккөз: ${escapeHTML(b.source)}. Оқу сілтемесі сыртқы сайтта ашылады.<br>Мұқабалар — көркем иллюстрациялар.</p></div></div>${related.length?`<div class="dialog-related"><h3>Осы шығарма ұнаса</h3><div class="related-links">${related.map(x=>`<button class="related-link" data-details="${x.book.book_id}">${escapeHTML(x.book.title)}<small>${escapeHTML(x.book.author)}</small></button>`).join('')}</div></div>`:''}`;
 const dialog=$('#book-dialog');if(!dialog.open)dialog.showModal();$('#dialog-content').scrollTop=0;
}
function resetCatalog(){query='';genre='Барлығы';page=1;$('#catalog-search input').value='';renderCatalog();}
document.addEventListener('click',e=>{
 const favorite=e.target.closest('[data-favorite]');if(favorite){toggleFavorite(Number(favorite.dataset.favorite));return;}
 const details=e.target.closest('[data-details]');if(details){showDetails(Number(details.dataset.details));return;}
 const filter=e.target.closest('[data-genre]');if(filter){genre=filter.dataset.genre;page=1;renderCatalog();return;}
 const paging=e.target.closest('[data-page]');if(paging&&!paging.disabled){page=Number(paging.dataset.page);renderCatalog();$('#books-view').scrollIntoView({behavior:'instant'});}
});
$('#hero-search').addEventListener('submit',e=>{e.preventDefault();query=new FormData(e.target).get('q').trim();genre='Барлығы';page=1;$('#catalog-search input').value=query;if(location.hash==='#books')renderCatalog();else location.hash='books';});
$('#catalog-search').addEventListener('submit',e=>{e.preventDefault();query=new FormData(e.target).get('q').trim();page=1;renderCatalog();});
$('#catalog-search input').addEventListener('input',e=>{query=e.target.value.trim();page=1;renderCatalog();});
$('#sort').addEventListener('change',e=>{sort=e.target.value;page=1;renderCatalog();});
$('#clear-filters').addEventListener('click',resetCatalog);$('#reset-search').addEventListener('click',resetCatalog);
$('.dialog-close').addEventListener('click',()=>$('#book-dialog').close());
$('#book-dialog').addEventListener('click',e=>{if(e.target===$('#book-dialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}});
window.addEventListener('hashchange',showView);
window.addEventListener('storage',e=>{if(e.key===STORAGE_KEY){try{const list=JSON.parse(e.newValue||'[]');if(!Array.isArray(list))return;favorites=new Set(list.filter(id=>Number.isInteger(id)&&getBook(id)));updateFavoriteControls();if(activeView==='favorites')renderFavorites();if(activeView==='recommendations')renderRecommendations();}catch{}}});
$('#featured-books').innerHTML=Array.from({length:4},()=>'<div class="loading-placeholder" aria-label="Жүктелуде"></div>').join('');
showView();
(async()=>{
 try{const responses=await Promise.all([fetch('assets/books.json'),fetch('assets/similarities.json')]);if(responses.some(r=>!r.ok))throw Error('Catalog request failed');[books,similarities]=await Promise.all(responses.map(r=>r.json()));favorites=new Set([...favorites].filter(id=>getBook(id)));$('#featured-books').innerHTML=featuredIds.map(getBook).filter(Boolean).map(b=>cardHTML(b)).join('');const genres=['Барлығы',...new Set(books.map(b=>b.category))];$('#genre-filters').innerHTML=genres.map(g=>`<button class="filter-chip ${g==='Барлығы'?'active':''}" data-genre="${escapeHTML(g)}" aria-pressed="${g==='Барлығы'}">${escapeHTML(g)}</button>`).join('');updateFavoriteControls();showView();applyBackendArgs();}
 catch(error){console.error('Каталог жүктелмеді:',error);$$('.view').forEach(v=>v.hidden=true);$('#load-error').hidden=false;}
})();


// Streamlit component protocol: preserve the original interface and route persistence to Python.
const READER_KEY='bookrec-design-reader-v1';
const STATUS_KEY='bookrec-design-reading-status-v1';
function sameIds(a,b){return JSON.stringify([...a].sort((x,y)=>x-y))===JSON.stringify([...b].sort((x,y)=>x-y));}
function readLocal(key,fallback){try{return JSON.parse(localStorage.getItem(key)||'null')??fallback;}catch{return fallback;}}
function postComponent(type,values={}){if(window.parent!==window)window.parent.postMessage({isStreamlitMessage:true,type,...values},'*');}
function sendBackendAction(action,values={}){
 if(window.parent===window)return;
 lastBackendEvent=globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random()}`;
 postComponent('streamlit:setComponentValue',{value:{id:lastBackendEvent,action,...values}});
}
function syncBackend(){
 if(!backendState)return;
 try{localStorage.setItem(STATUS_KEY,JSON.stringify(readingStatuses));}catch{}
 sendBackendAction('sync_state',{favorites:[...favorites],statuses:readingStatuses});
}
function renderReadingStatuses(){
 $$('#favorite-books .book-card').forEach(card=>{
  const id=Number(card.dataset.bookId);
  const labels={planned:'Оқимын',reading:'Оқып жатырмын',finished:'Оқып бітірдім'};
  const label=document.createElement('label');label.className='reading-state-control';
  label.innerHTML=`<span>Оқу мәртебесі</span><select data-reading-status="${id}" aria-label="${escapeHTML(getBook(id)?.title)}: оқу мәртебесі">${Object.entries(labels).map(([value,text])=>`<option value="${value}" ${(readingStatuses[id]||'planned')===value?'selected':''}>${text}</option>`).join('')}</select>`;
  $('.book-info',card).append(label);
 });
}
function applyBackendArgs(){
 if(!latestBackendArgs||!books.length)return;
 const args=latestBackendArgs,state=args.state;
 if(!state||!Array.isArray(state.favorites))return;
 if(!restoreAttempted){
  restoreAttempted=true;
  const cached=readLocal(READER_KEY,'');
  if(typeof cached==='string'&&/^[0-9a-f]{32}$/.test(cached)&&cached!==state.reader){
   sendBackendAction('restore_reader',{reader:cached,snapshot:{favorites:readLocal(STORAGE_KEY,[]),statuses:readLocal(STATUS_KEY,{})}});
   return;
  }
 }
 if(lastBackendEvent && args.ack!==lastBackendEvent)return;
 backendState=state;favorites=new Set(state.favorites.filter(id=>getBook(id)));readingStatuses=state.statuses||{};
 try{localStorage.setItem(READER_KEY,JSON.stringify(state.reader));localStorage.setItem(STORAGE_KEY,JSON.stringify([...favorites]));localStorage.setItem(STATUS_KEY,JSON.stringify(readingStatuses));}catch{}
 updateFavoriteControls();
 if(activeView==='favorites')renderFavorites();if(activeView==='recommendations')renderRecommendations();
 if(args.error&&args.error!==lastBackendError)notify(args.error);
 lastBackendError=args.error||'';
}
document.addEventListener('change',event=>{
 const control=event.target.closest('[data-reading-status]');if(!control)return;
 readingStatuses[control.dataset.readingStatus]=control.value;syncBackend();
});
window.addEventListener('message',event=>{
 if(event.source!==window.parent||event.data?.type!=='streamlit:render')return;
 latestBackendArgs=event.data.args;applyBackendArgs();
});
let lastFrameHeight=0,frameTimer;
function resizeFrame(){
 clearTimeout(frameTimer);frameTimer=setTimeout(()=>{const height=Math.ceil(document.body.scrollHeight+2);if(Math.abs(height-lastFrameHeight)>1){lastFrameHeight=height;postComponent('streamlit:setFrameHeight',{height});}},60);
}
new ResizeObserver(resizeFrame).observe(document.body);
postComponent('streamlit:componentReady',{apiVersion:1});resizeFrame();
