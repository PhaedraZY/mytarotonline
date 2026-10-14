"use strict";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
const escapeHTML = value => String(value ?? "").replace(/[&<>"']/g, character => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[character]));
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const narrowScreen = window.matchMedia("(max-width: 780px)");
const isStatic = window.LUNARIA_DEPLOYMENT?.mode === "pages";
const staticAdapter = isStatic ? import("./static-api.js") : null;
const staticPreferences = new Map();
const state = {catalog:null, settings:null, reading:null, revealed:0, page:0, phase:"question", busy:false, interpreting:false, followupPending:new Set(), restoreRequest:0, generation:0};
const storage = {get(key){if(isStatic)return staticPreferences.get(key)??null;try{return localStorage.getItem(`lunaria:${key}`);}catch{return null;}},set(key,value){if(isStatic){staticPreferences.set(key,String(value));return staticAdapter.then(adapter=>adapter.setPreference(key,value));}try{localStorage.setItem(`lunaria:${key}`,String(value));}catch{}},remove(key){if(isStatic){staticPreferences.delete(key);return staticAdapter.then(adapter=>adapter.removePreference(key));}try{localStorage.removeItem(`lunaria:${key}`);}catch{}}};
const delay = duration => new Promise(resolve => setTimeout(resolve, duration));
let toastTimer;
let fanView = {readingId:null,slots:[],opened:false};
const paragraphs = value => String(value ?? "").trim().split(/\n+/).filter(Boolean).map(text=>`<p>${escapeHTML(text)}</p>`).join("");

function toast(message) { $("#toast").textContent=message; $("#toast").hidden=false; clearTimeout(toastTimer); toastTimer=setTimeout(()=>$("#toast").hidden=true,4500); }
function status(selector,message,kind="") { const element=$(selector); element.textContent=message; element.className=`inline-status ${kind}`; }
function scrollToElement(element) { element.scrollIntoView({behavior:reducedMotion.matches?"instant":"smooth",block:"start"}); }
function setStep(step) { const order=["question","shuffle","select","reading"]; $$("[data-step]").forEach(element=>{const active=element.dataset.step===step;element.classList.toggle("active",active);element.classList.toggle("done",order.indexOf(element.dataset.step)<order.indexOf(step));if(active)element.setAttribute("aria-current","step");else element.removeAttribute("aria-current");}); }
async function api(path,body,timeout=45000) {
  if(isStatic)return (await staticAdapter).request(path,body);
  const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),timeout);
  try {
    const response=await fetch(path,{method:body===undefined?"GET":"POST",headers:body===undefined?{}:{"Content-Type":"application/json"},body:body===undefined?undefined:JSON.stringify(body),signal:controller.signal});
    const data=await response.json().catch(()=>({message:"服务返回了无法读取的内容，请稍后再试。"}));
    if(!response.ok) throw new Error(data.message||data.error||"这次连接未能完成，请再试一次。");
    return data;
  } catch(error) {
    if(error.name==="AbortError") throw new Error("这次等待有些久，连接已超时。你的抽牌结果已保留，可以重新尝试。");
    if(error instanceof TypeError) throw new Error("暂时无法连接本机服务。请确认网站服务仍在运行后重试。");
    throw error;
  } finally {clearTimeout(timer);}
}

function applyTheme(name,persist=true) {
  const theme=themes[name]||themes.lunar; name=themes[name]?name:"lunar";
  document.body.dataset.theme=name; document.title=`LUNARIA · ${theme.title}`;
  $("#world-description").innerHTML=theme.description; $("#ritual-guide").textContent=theme.guide;
  $("#reading-eyebrow").textContent=(themes[state.reading?.theme]||theme).note;
  $$("[data-world]").forEach(button=>{const active=button.dataset.world===name;button.classList.toggle("active",active);button.setAttribute("aria-pressed",String(active));});
  if(persist)Promise.resolve(storage.set("theme",name)).catch(error=>toast(error.message));
}
$$("[data-art]").forEach(element=>element.innerHTML=cardSVG(element.dataset.art));
$$("[data-world]").forEach(button=>button.addEventListener("click",()=>{applyTheme(button.dataset.world);if(state.reading)toast(isStatic?"世界氛围已切换，牌面的基础释义保持一致。":"世界氛围已切换。本次解读仍沿用抽牌时的角色，下一次相遇将使用新角色。");}));
applyTheme(storage.get("theme")||"lunar",!isStatic);
$$("[data-enter]").forEach(button=>button.addEventListener("click",()=>{$("#ritual").hidden=false;scrollToElement($("#ritual"));$("#ritual-title").focus({preventScroll:true});}));

function openDialog(name) {
  const dialog=$(`#${name}-dialog`); if(!dialog)return;
  if(!dialog.open)dialog.showModal(); document.body.classList.add("dialog-open");
  if(name==="library")renderLibrary(); if(name==="journal")loadJournal(); if(name==="settings")loadSettings();
}
$$("[data-open]").forEach(button=>button.addEventListener("click",()=>openDialog(button.dataset.open)));
$$("dialog").forEach(dialog=>{ $("[data-close]",dialog).addEventListener("click",()=>dialog.close()); dialog.addEventListener("click",event=>{if(event.target===dialog){const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.close();}});dialog.addEventListener("close",()=>{if(!$$("dialog[open]").length)document.body.classList.remove("dialog-open");}); });

function readingCount(){return state.reading?.requiredCount||state.reading?.positions?.length||3;}
function positionLabel(index){const position=state.reading?.positions?.[index];return state.reading?.drawn?.[index]?.positionLabel||position?.label||position?.name||["当下","未见之处","温柔的指引"][index]||"此刻的指引";}
function spreadFor(reading=state.reading){return state.catalog?.spreads?.find(spread=>spread.id===reading?.spreadId);}
function positionDescription(index){return state.reading?.positions?.[index]?.description||spreadFor()?.positions?.[index]?.description||"";}
function spreadLayout(reading=state.reading){const layout=reading?.layout||spreadFor(reading)?.layout;return ["single","row","decision","relationship","cross"].includes(layout)?layout:readingCount()===1?"single":"row";}
function renderSpreadOptions(){
  const spreads=state.catalog?.spreads||[];if(!spreads.length)return;
  const previous=$("input[name=spread]:checked")?.value;const active=spreads.find(spread=>spread.id===previous)?.id||spreads.find(spread=>spread.id==="three")?.id||spreads[0].id;
  $("#spread-options").innerHTML='<legend>从你的问题出发，选择一种牌阵</legend>'+spreads.map(spread=>`<label class="spread-option"><input type="radio" name="spread" value="${escapeHTML(spread.id)}" ${spread.id===active?"checked":""}><span class="spread-copy"><span class="spread-title"><strong>${escapeHTML(spread.name)}</strong><span class="spread-count">${spread.positions.length} 张</span></span><small>${escapeHTML(spread.description||(spread.positions||[]).map(position=>position.label||position.name).join(" / "))}</small></span></label>`).join("");
  $$("input[name=spread]").forEach(input=>input.addEventListener("change",renderSpreadGuide));renderSpreadGuide();
}
function renderSpreadGuide(){
  const spread=state.catalog?.spreads.find(item=>item.id===$("input[name=spread]:checked")?.value);const guide=$("#spread-guide");if(!spread){guide.hidden=true;return;}
  guide.hidden=false;guide.innerHTML=`<div class="spread-guide-heading"><span class="mini-label">HOW TO READ THIS SPREAD</span><p>${escapeHTML(spread.questionHint||spread.description||"按照下面的顺序，依次抽出每一个牌位的牌。")}</p></div><ol>${spread.positions.map((position,index)=>`<li><span class="position-number">${String(index+1).padStart(2,"0")}</span><div><strong>${escapeHTML(position.label||position.name)}</strong>${position.description?`<p>${escapeHTML(position.description)}</p>`:""}</div></li>`).join("")}</ol>`;
  if(spread.questionHint)$("#question").placeholder=spread.questionHint;
}
function cardFor(draw={}){return draw.card||state.catalog?.cards.find(card=>card.id===draw.cardId)||{id:draw.cardId,name:draw.cardId||"塔罗牌",image:""};}
async function rememberReading(){if(!state.reading)return;await Promise.all([storage.set("reading",state.reading.id),storage.set(`revealed:${state.reading.id}`,state.revealed)]);$("#resume-reading").hidden=false;}

$("#question-form").addEventListener("submit",async event=>{
  event.preventDefault();if(state.busy||!state.catalog)return;
  const generation=++state.generation;state.busy=true;state.page=0;state.revealed=0;state.reading=null;state.phase="shuffle";fanView={readingId:null,slots:[],opened:false};
  $("#question-form").hidden=true;$("#draw-stage").hidden=false;$("#shuffle-scene").hidden=false;$("#selection-scene").hidden=true;$("#reading").hidden=true;setStep("shuffle");
  $("#shuffle-stack").innerHTML=Array.from({length:7},(_,index)=>`<div class="shuffle-card" style="--i:${index}">${cardSVG("moon",true)}</div>`).join("");
  scrollToElement($("#ritual"));
  const request={question:$("#question").value.trim(),spreadId:$("input[name=spread]:checked").value,allowReversed:$("#allow-reversed").checked,theme:document.body.dataset.theme,clientRequestId:crypto.randomUUID()};
  try {
    const [reading]=await Promise.all([api("/api/readings",request),delay(reducedMotion.matches?120:2700)]);
    if(generation!==state.generation)return;state.reading=reading;state.phase="select";await rememberReading();renderDraw();$("#draw-status").focus({preventScroll:true});
  } catch(error){$("#question-form").hidden=false;$("#draw-stage").hidden=true;state.phase="question";setStep("question");status("#start-status",error.message,"error");}
  finally {if(generation===state.generation)state.busy=false;}
});

function renderDraw() {
  if(!state.reading)return;
  const drawn=state.reading.drawn||[];const count=readingCount();const complete=drawn.length>=count;
  $("#ritual").hidden=false;$("#question-form").hidden=true;$("#draw-stage").hidden=false;$("#shuffle-scene").hidden=true;$("#selection-scene").hidden=false;
  $("#deck-label").textContent=`${state.reading.spreadName||spreadFor()?.name||"THE COMPLETE DECK"} / ${state.catalog?.cards.length||78} 张 · 已洗好`;
  $("#fan-area").hidden=false;$("#fan-pagination").hidden=false;$("#fan-area").classList.toggle("deck-complete",complete);$("#draw-cards").classList.toggle("single",count===1);$("#draw-cards").dataset.layout=spreadLayout();$("#draw-cards").dataset.count=count;
  $("#selected-heading").textContent=`已放下 ${drawn.length} / ${count} 张 · ${complete?"依次翻开":"从同一副牌中继续选择"}`;
  $("#fan-hint").textContent=complete?"本次选牌已完成。它们来自同一次洗牌，现在看看各自的回应。":"只洗这一次。慢慢选，剩下的牌会留在原位。";
  $("#draw-position-description").textContent=positionDescription(complete?Math.min(state.revealed,count-1):drawn.length);
  if(!complete){state.phase="select";setStep("select");$("#draw-status").textContent=`为「${positionLabel(drawn.length)}」选择第 ${drawn.length+1} 张牌 · 已选 ${drawn.length} / ${count}`;}
  else if(state.revealed<count){state.phase="reveal";setStep("select");$("#draw-status").textContent=`轻触第 ${state.revealed+1} 张牌，看看「${positionLabel(state.revealed)}」。`;}
  else {state.phase="reading";setStep("reading");$("#draw-status").textContent="所有牌已翻开。一起看看它们如何回应你的问题。";$("#draw-position-description").textContent="";}
  renderFan();renderSelected();updateRevealButton();status("#draw-error","");
}

function renderFan() {
  const reading=state.reading;if(!reading)return;
  const incoming=reading.slots||[];const drawnTokens=new Set((reading.drawn||[]).map(draw=>draw.token).filter(Boolean));
  if(fanView.readingId!==reading.id){fanView={readingId:reading.id,slots:incoming.map(slot=>({...slot})),opened:false};}
  const current=new Map(incoming.map(slot=>[slot.token,slot]));
  // Keep each original position even when an older API returns only unselected slots.
  fanView.slots.forEach(slot=>{slot.selected=Boolean(slot.selected||current.get(slot.token)?.selected||drawnTokens.has(slot.token)||!current.has(slot.token));});
  const slots=fanView.slots;const pageSize=narrowScreen.matches?13:26;const pages=Math.max(1,Math.ceil(slots.length/pageSize));state.page=Math.min(Math.max(0,state.page),pages-1);
  const start=state.page*pageSize;const visible=slots.slice(start,start+pageSize);const fan=$("#card-fan");const complete=(reading.drawn||[]).length>=readingCount();
  const key=`${reading.id}:${state.page}:${pageSize}`;const changed=fan.dataset.view!==key;
  const animate=!fanView.opened&&!reading.drawn.length;fanView.opened=true;
  if(changed){
    fan.replaceChildren(...visible.map((slot,index)=>{const button=document.createElement("button");button.className=`fan-card${animate?" entering":""}`;button.type="button";button.dataset.token=slot.token;button.innerHTML=cardSVG("moon",true);button.addEventListener("click",()=>selectCard(button));button.addEventListener("animationend",()=>button.classList.remove("entering"),{once:true});return button;}));
    fan.dataset.view=key;fan.scrollLeft=0;
  }
  const spread=Math.min(690,Math.max(240,fan.clientWidth-150));
  fan.style.setProperty("--slot-width",`${visible.length>1?spread/(visible.length-1):108}px`);
  $$(".fan-card",fan).forEach((button,index)=>{const slot=visible[index];const unit=visible.length>1?(index/(visible.length-1)-.5):0;button.style.setProperty("--i",index);button.style.setProperty("--x",`${unit*spread}px`);button.style.setProperty("--y",`${Math.abs(unit)*47}px`);button.style.setProperty("--r",`${unit*48}deg`);button.classList.toggle("picked",slot.selected);button.classList.remove("chosen");button.disabled=slot.selected||complete;button.dataset.selected=String(slot.selected);button.setAttribute("aria-label",`第 ${start+index+1} 张牌${slot.selected?"，已放入牌阵":"，选择这张牌"}`);button.tabIndex=slot.selected?-1:0;});
  const remaining=slots.filter(slot=>!slot.selected).length;
  $("#fan-page").textContent=`第 ${start+1}–${Math.min(start+pageSize,slots.length)} 张 / 余 ${remaining} 张`;
  $("#previous-cards").disabled=complete||state.page===0;$("#next-cards").disabled=complete||state.page===pages-1;
}
$("#previous-cards").addEventListener("click",()=>{if(state.busy)return;state.page--;renderFan();});
$("#next-cards").addEventListener("click",()=>{if(state.busy)return;state.page++;renderFan();});
let resizeTimer;window.addEventListener("resize",()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(state.phase==="select"&&state.reading&&!state.busy)renderFan();},180);});

async function selectCard(button) {
  if(state.busy||state.phase!=="select")return;
  state.busy=true;const previousCount=state.reading.drawn.length;const id=state.reading.id;const generation=state.generation;const keyboard=button.matches(":focus-visible");
  $$(".fan-card").forEach(element=>element.disabled=true);$("#previous-cards").disabled=true;$("#next-cards").disabled=true;button.classList.add("chosen");
  try {
    const [reading]=await Promise.all([api(`/api/readings/${encodeURIComponent(id)}/select`,{token:button.dataset.token}),delay(reducedMotion.matches?0:350)]);
    if(generation!==state.generation)return;state.reading=reading;await rememberReading();renderDraw();
    if(state.reading.drawn.length===readingCount()){$("#reveal-button").focus({preventScroll:true});scrollToElement($("#draw-cards"));}
    else if(keyboard){const buttons=$$(".fan-card");const index=buttons.indexOf(button);(buttons.slice(index+1).find(card=>!card.disabled)||buttons.find(card=>!card.disabled))?.focus({preventScroll:true});}
  } catch(error) {
    // A timed-out request may already have selected its card. Reconcile before allowing another pick.
    try{const fresh=await api(`/api/readings/${encodeURIComponent(id)}`);if(generation!==state.generation)return;state.reading=fresh;renderDraw();if((fresh.drawn||[]).length===previousCount)status("#draw-error",error.message,"error");else toast("这张牌已选好，继续你的旅程。");}
    catch{if(generation===state.generation){renderDraw();status("#draw-error",error.message,"error");}}
  } finally{if(generation===state.generation)state.busy=false;}
}

function renderSelected() {
  const count=readingCount();const drawn=state.reading.drawn||[];const container=$("#draw-cards");const existing=container.dataset.reading===state.reading.id;
  if(!existing){container.innerHTML=Array.from({length:count},(_,index)=>`<div class="draw-card-wrap empty" data-position="${index}"><div class="card-placeholder"><span>${String(index+1).padStart(2,"0")}</span><small>等待放入</small></div><p class="draw-card-caption">${escapeHTML(positionLabel(index))}</p></div>`).join("");container.dataset.reading=state.reading.id;}
  $$(".draw-card-wrap",container).forEach((wrapper,index)=>{
    const draw=drawn[index];const label=positionLabel(index);wrapper.title=positionDescription(index);wrapper.dataset.displayNumber=String(index+1).padStart(2,"0");if(!draw)return;
    const card=cardFor(draw);const revealed=index<state.revealed;const next=drawn.length===count&&index===state.revealed;
    let button=$(".draw-card",wrapper);
    if(!button){
      wrapper.classList.remove("empty");wrapper.innerHTML=`<button class="draw-card" type="button" data-reveal="${index}"><span class="draw-card-inner"><span class="card-face card-back">${cardSVG("moon",true)}</span><span class="card-face card-front"><img src="${escapeHTML(card.image)}" alt="" class="${draw.orientation==="reversed"?"reversed":""}"></span></span></button><p class="draw-card-caption"></p>`;
      button=$(".draw-card",wrapper);button.addEventListener("click",revealNext);
      if(existing){wrapper.classList.add("just-arrived");wrapper.addEventListener("animationend",()=>wrapper.classList.remove("just-arrived"),{once:true});}else if(revealed)button.classList.add("restored");
    }
    button.classList.toggle("flipped",revealed);button.classList.toggle("ready",next);button.disabled=!next;button.setAttribute("aria-label",revealed?`${label}：${card.name}，${draw.orientation==="reversed"?"逆位":"正位"}`:drawn.length===count?`翻开第 ${index+1} 张牌：${label}`:`第 ${index+1} 张牌已放好：${label}`);$("img",button).alt=revealed?card.name:"";
    $(".draw-card-caption",wrapper).innerHTML=`${escapeHTML(label)}<strong>${revealed?`${escapeHTML(card.name)}<span class="orientation">${draw.orientation==="reversed"?"逆位":"正位"}</span>`:"· · ·"}</strong>`;
  });
}
function updateRevealButton() {
  const ready=state.reading.drawn.length===readingCount()&&state.revealed<readingCount();
  $("#reveal-button").hidden=!ready;$("#reveal-button").disabled=false;
  $("#reveal-button").innerHTML=`轻触，开启第 ${state.revealed+1} 张牌 <span aria-hidden="true">✧</span>`;
}
$("#reveal-button").addEventListener("click",revealNext);
async function revealNext() {
  if(state.busy||!state.reading||state.reading.drawn.length<readingCount()||state.revealed>=readingCount())return;
  state.busy=true;const generation=state.generation;const index=state.revealed;const draw=state.reading.drawn[index];const card=cardFor(draw);const button=$(`[data-reveal="${index}"]`);
  button.classList.remove("ready");button.classList.add("flipped");button.disabled=true;button.setAttribute("aria-label",`${positionLabel(index)}：${card.name}，${draw.orientation==="reversed"?"逆位":"正位"}`);$("img",button).alt=card.name;
  $("#reveal-button").disabled=true;state.revealed++;try{await rememberReading();}catch(error){toast(error.message);}
  await delay(reducedMotion.matches?0:650);if(generation!==state.generation)return;
  button.nextElementSibling.innerHTML=`${escapeHTML(positionLabel(index))}<strong>${escapeHTML(card.name)}<span class="orientation">${draw.orientation==="reversed"?"逆位":"正位"}</span></strong>`;
  state.busy=false;updateRevealButton();
  if(state.revealed===readingCount()){state.phase="reading";setStep("reading");$("#draw-status").textContent="所有牌已翻开。一起看看它们如何回应你的问题。";$("#draw-position-description").textContent="";await interpretReading();}
  else {const next=$(`[data-reveal="${state.revealed}"]`);next.disabled=false;next.classList.add("ready");$("#draw-status").textContent=`轻触第 ${state.revealed+1} 张牌，看看「${positionLabel(state.revealed)}」。`;$("#draw-position-description").textContent=positionDescription(state.revealed);next.focus({preventScroll:true});if(readingCount()>3)next.scrollIntoView({behavior:reducedMotion.matches?"instant":"smooth",block:"center"});}
}

function resetRitual(){if(state.interpreting){toast("这封信还在书写中，请等它完成后再开启新的相遇。");return;}state.generation++;state.reading=null;state.revealed=0;state.busy=false;state.phase="question";$("#reading").hidden=true;$("#draw-stage").hidden=true;$("#question-form").hidden=false;$("button",$("#followup-form")).disabled=false;setStep("question");status("#start-status","");scrollToElement($("#ritual"));$("#question").focus({preventScroll:true});}
$("#restart-draw").addEventListener("click",resetRitual);$("#restart-button").addEventListener("click",resetRitual);

async function interpretReading(provider) {
  if(state.interpreting||!state.reading)return;
  const id=state.reading.id;state.interpreting=true;$("#reading").hidden=false;$("#reading-content").hidden=true;$("#interpret-error").hidden=true;$("#interpret-loading").hidden=false;$("#reading-mode").textContent="正在倾听牌面的回响";
  $("#reading-question").textContent=state.reading.question?`你留下的问题：「${state.reading.question}」`:"为此刻的自己，留一点安静的空间。";
  $("#reading-eyebrow").textContent=(themes[state.reading.theme]||themes[document.body.dataset.theme]).note;
  $("#followup-answers").innerHTML="";status("#followup-status","");scrollToElement($("#reading"));
  try {
    const result=await api(`/api/readings/${encodeURIComponent(id)}/interpret`,provider?{provider}:{},240000);
    if(state.reading?.id!==id)return;state.reading.interpretation=result.interpretation;state.reading.status="complete";state.reading.mode=result.mode;state.reading.provider=result.provider;state.reading.model=result.model;renderInterpretation(result);await rememberReading();
  } catch(error) {$("#interpret-error-text").textContent=error.message;$("#interpret-error").hidden=false;$("#reading-mode").textContent="牌面已保存 · 解读待继续";}
  finally{state.interpreting=false;$("#interpret-loading").hidden=true;}
}
$("#retry-interpret").addEventListener("click",()=>interpretReading());$("#reference-interpret").addEventListener("click",()=>interpretReading("reference"));

function renderInterpretation(result) {
  const interpretation=result.interpretation; if(!interpretation)return;
  $("#reading").hidden=false;$("#reading-content").hidden=false;$("#interpret-loading").hidden=true;$("#interpret-error").hidden=true;
  const reference=result.mode==="reference"||result.provider==="reference";
  $("#reading-mode").textContent=reference?"基础牌义 · 未使用 AI 生成":`AI 解读 · ${result.model||result.provider||"角色引路人"}`;
  $("#reading-question").textContent=state.reading.question?`你留下的问题：「${state.reading.question}」`:"为此刻的自己，留一点安静的空间。";
  $("#reading-summary").innerHTML=paragraphs(interpretation.summary);
  const parts=interpretation.cards||[];
  $("#reading-sections").innerHTML=parts.map((part,index)=>{const draw=state.reading.drawn.find(item=>item.cardId===part.cardId&&(!part.positionId||item.positionId===part.positionId))||state.reading.drawn[index]||{};const card=cardFor(draw);const orientation=part.orientation||draw.orientation;return `<section class="reading-section"><div class="reading-card-image">${card.image?`<img src="${escapeHTML(card.image)}" alt="${escapeHTML(card.name)}${orientation==="reversed"?"逆位":"正位"}" class="${orientation==="reversed"?"reversed":""}" loading="lazy">`:""}<span>${String(index+1).padStart(2,"0")}</span></div><div class="reading-card-copy"><p class="reading-position">${escapeHTML(draw.positionLabel||positionLabel(index))}</p><h4>${escapeHTML(card.name)} <span class="reading-orientation">${orientation==="reversed"?"逆位":"正位"}</span></h4>${!reference&&positionDescription(index)?`<p class="reading-position-help">这个牌位关注：${escapeHTML(positionDescription(index))}</p>`:""}${part.symbolAnchor?`<p class="symbol-anchor">${escapeHTML(part.symbolAnchor)}</p>`:""}<div class="card-interpretation">${paragraphs(part.interpretation)}</div>${part.reflectionQuestion?`<p class="reflection-question">${escapeHTML(part.reflectionQuestion)}</p>`:""}</div></section>`;}).join("");
  $(".synthesis-section h4").textContent=parts.length===1?"这张牌对你的提醒":"把这些牌放在一起看";
  $(".synthesis-section .eyebrow").textContent=parts.length===1?"BRING THE MESSAGE INTO YOUR LIFE":"THE THREAD BETWEEN YOUR CARDS";
  $("#reading-synthesis").innerHTML=paragraphs(interpretation.synthesis);$("#reading-closing").textContent=interpretation.closing||themes[document.body.dataset.theme].closing;
  const actions=interpretation.actions||[];$("#actions-section").hidden=actions.length===0;$("#reading-actions").innerHTML=actions.map(action=>`<li>${escapeHTML(typeof action==="string"?action:action.text||action.description||action.title||"")}</li>`).join("");
  $("#followup-form").hidden=reference;$("#reading-title").focus({preventScroll:true});
}

$("#followup-form").addEventListener("submit",async event=>{
  event.preventDefault();const input=$("#followup-question");const question=input.value.trim();if(!question||!state.reading||state.followupPending.has(state.reading.id))return;const id=state.reading.id;state.followupPending.add(id);const button=$("button",event.currentTarget);button.disabled=true;status("#followup-status","正在沿着你的问题，继续倾听…");
  try{const result=await api(`/api/readings/${encodeURIComponent(id)}/followups`,{question},240000);if(state.reading?.id===id){appendFollowup(question,result.answer);input.value="";status("#followup-status","");}}catch(error){if(state.reading?.id===id)status("#followup-status",error.message,"error");}finally{state.followupPending.delete(id);if(state.reading?.id===id)button.disabled=false;}
});
function appendFollowup(question,answer){const section=document.createElement("section");section.className="followup-answer";section.innerHTML=`<strong>${escapeHTML(question)}</strong><div>${paragraphs(answer)}</div>`;$("#followup-answers").append(section);}

async function restoreReading(id) {
  if(state.interpreting){toast("当前解读还在进行，请等这封信写完后再翻阅手记。");return;}
  const restoreRequest=++state.restoreRequest;
  try {
    const reading=await api(`/api/readings/${encodeURIComponent(id)}`);if(restoreRequest!==state.restoreRequest)return;state.generation++;state.reading=reading;state.revealed=reading.interpretation?reading.drawn.length:Math.min(Number(storage.get(`revealed:${id}`)||0),reading.drawn.length);state.page=0;state.busy=false;$("button",$("#followup-form")).disabled=state.followupPending.has(id);$("#followup-question").value="";status("#followup-status",state.followupPending.has(id)?"这次追问仍在生成，稍后重新打开手记即可查看。":"");
    if(reading.theme&&themes[reading.theme])applyTheme(reading.theme);$("#question").value=reading.question||"";$("#reading").hidden=true;renderDraw();await rememberReading();$("#journal-dialog").close();scrollToElement($("#ritual"));
    if(reading.interpretation){$("#followup-answers").innerHTML="";renderInterpretation(reading);(reading.followups||[]).forEach(item=>appendFollowup(item.question,item.answer));}
    else if(state.revealed===readingCount()&&reading.drawn.length===readingCount())await interpretReading();
  }catch(error){if(restoreRequest===state.restoreRequest)toast(error.message);}
}
$("#resume-reading").addEventListener("click",()=>{const id=storage.get("reading");if(id)restoreReading(id);});
async function loadJournal(){
  $("#journal-list").innerHTML='<p class="empty-state">正在翻开这些相遇…</p>';
  try{const data=await api("/api/history");const readings=data.readings||[];$("#journal-list").innerHTML=readings.length?readings.map(reading=>{const date=new Date(reading.createdAt);return `<button class="journal-entry" data-reading-id="${escapeHTML(reading.id)}"><span class="journal-date"><span>${Number.isNaN(date.valueOf())?"某个属于你的时刻":escapeHTML(date.toLocaleString("zh-CN",{month:"long",day:"numeric",hour:"2-digit",minute:"2-digit"}))}</span><span>${reading.status==="complete"?"已写下回响":"继续这次相遇 →"}</span></span><strong>${escapeHTML(reading.question||"留给此刻自己的一束微光")}</strong><p>${escapeHTML((reading.cardNames||[]).join(" · ")||"牌还在等待与你相遇")}</p></button>`;}).join(""):'<div class="empty-state">这里还安静地空着。<br>当你开启第一次占卜，星光会替你记住。</div>';$$("[data-reading-id]").forEach(button=>button.addEventListener("click",()=>restoreReading(button.dataset.readingId)));}catch(error){$("#journal-list").innerHTML=`<p class="empty-state">${escapeHTML(error.message)}</p>`;}
}

function renderLibrary(){
  if(!state.catalog){$("#library-grid").innerHTML='<p class="empty-library">牌组正在展开，请稍后再打开图鉴。</p>';return;}
  const filter=$("#library-filter").value;const search=$("#library-search").value.trim().toLowerCase();
  const visible=state.catalog.cards.filter(card=>(filter==="all"||(filter==="major"?card.arcana==="major":card.suit===filter))&&(!search||`${card.id} ${card.name} ${card.nameEn} ${(card.upright?.keywords||[]).join(" ")} ${(card.reversed?.keywords||[]).join(" ")}`.toLowerCase().includes(search)));
  $("#library-count").textContent=`${visible.length} 张牌，${search?"回应你的寻找":"等待被认识"}。`;
  $("#library-grid").innerHTML=visible.length?visible.map(card=>`<button class="library-card" data-detail="${escapeHTML(card.id)}" aria-label="查看${escapeHTML(card.name)}的牌义"><img src="${escapeHTML(card.image)}" alt="${escapeHTML(card.name)}" loading="lazy" decoding="async"><strong>${escapeHTML(card.name)}</strong><small>${escapeHTML(card.nameEn)}</small></button>`).join(""):'<p class="empty-library">没有找到这张牌。试试中文名、英文名或关键词。</p>';
  $$("[data-detail]").forEach(button=>button.addEventListener("click",()=>showCardDetail(button.dataset.detail)));
}
$("#library-search").addEventListener("input",renderLibrary);$("#library-filter").addEventListener("change",renderLibrary);
function showCardDetail(id){
  const card=state.catalog.cards.find(item=>item.id===id);if(!card)return;const detail=$("#card-detail");const symbolism=Array.isArray(card.symbolism)?card.symbolism.join("\n"):card.symbolism;
  const meaningSection=(orientation,label)=>{const meaning=card[orientation]||{};return `<details class="meaning-orientation" ${orientation==="upright"?"open":""}><summary><strong>${label}</strong><span>${escapeHTML((meaning.keywords||[]).join(" / "))}</span></summary><div class="meaning-core">${paragraphs(meaning.meaning)}</div><dl class="meaning-contexts">${[["everyday","放到日常生活里"],["relationships","关系与相处"],["work","工作与创作"],["advice","可以做的一件小事"]].filter(([key])=>meaning[key]).map(([key,title])=>`<div><dt>${title}</dt><dd>${paragraphs(meaning[key])}</dd></div>`).join("")}</dl>${meaning.reflection?`<p class="meaning-reflection">留给自己的问题：${escapeHTML(meaning.reflection)}</p>`:""}</details>`;};
  detail.hidden=false;detail.innerHTML=`<div class="detail-art"><img src="${escapeHTML(card.image)}" alt="${escapeHTML(card.name)}"></div><div class="detail-content"><h3>${escapeHTML(card.name)}</h3><p class="detail-en">${escapeHTML(card.nameEn)} / ${escapeHTML(card.id)}</p>${symbolism?`<section class="detail-symbolism"><h4>从经典牌面，理解它的象征</h4>${paragraphs(symbolism)}</section>`:""}${meaningSection("upright","正位")}${meaningSection("reversed","逆位")}<p class="meaning-note">逆位不等于坏结果，也可能是某种力量受阻、过度，或正在向内发生。结合你的问题和牌位来理解。</p></div><button class="close-button" aria-label="收起牌义">×</button>`;$(".close-button",detail).addEventListener("click",()=>detail.hidden=true);detail.scrollIntoView({behavior:reducedMotion.matches?"instant":"smooth",block:"start"});
}

function renderPreview(){const previewNames=["The Star","The Moon","The Hermit"];const chosen=previewNames.map(name=>state.catalog.cards.find(card=>card.nameEn?.toLowerCase()===name.toLowerCase())).filter(Boolean);if(chosen.length<3)chosen.push(...state.catalog.cards.filter(card=>!chosen.includes(card)).slice(0,3-chosen.length));$("#preview-cards").innerHTML=chosen.map(card=>`<img src="${escapeHTML(card.image)}" alt="" loading="lazy">`).join("");}
async function refreshCatalog(){state.catalog=await api("/api/catalog");$("#upload-card-id").innerHTML=state.catalog.cards.map(card=>`<option value="${escapeHTML(card.id)}">${escapeHTML(card.name)} · ${escapeHTML(card.id)}</option>`).join("");$("#library-title .title-count").textContent=state.catalog.cards.length;renderSpreadOptions();renderPreview();if($("#library-dialog").open){$("#card-detail").hidden=true;renderLibrary();}}

const baseURLGroup=document.createElement("div");baseURLGroup.id="base-url-group";baseURLGroup.innerHTML='<label for="base-url">API 地址</label><input id="base-url" type="url" autocomplete="off" placeholder="官方兼容 API 地址"><p class="field-note">百炼如使用专属工作空间，请填控制台提供的兼容接口地址。</p>';$("#api-key-group").before(baseURLGroup);
if(isStatic){
  document.body.dataset.deployment="pages";
  $(".demo-label").innerHTML='<span aria-hidden="true">✦</span> 78 张经典塔罗 · 免费基础牌义版';
  $("#settings-form").hidden=true;
  $$("input,select,button",$("#settings-form")).forEach(element=>element.disabled=true);
  const note=document.createElement("section");note.className="static-edition-note";note.innerHTML='<p class="eyebrow">A LITTLE SPACE, JUST FOR YOU</p><h3>从一张牌，开始认识自己。</h3><p>当前提供完整抽牌与基础牌义，暂未接入 AI，不会收集 API Key。云端个性化解读将在后续版本开放。</p><p>手记与原创牌图仅保存在当前浏览器，不会上传。清除网站数据或更换浏览器后，这些内容不会自动保留；请另外保存自己的原创文件。</p>';
  $("#settings-form").before(note);
  $("#settings-dialog > .drawer-description").textContent="为你的宇宙换上画作，让每一张牌都有你的风格。";
  $("#journal-dialog > .drawer-footnote").textContent="手记仅保存在当前浏览器。更换设备或清除网站数据后，记录不会自动保留。";
  $("#settings-dialog > .drawer-footnote").textContent="更换世界主题会改变视觉氛围；基础牌义与抽牌逻辑保持一致。";
  $("#ritual .ritual-disclaimer").textContent="当前为基础牌义版，没有调用 AI。塔罗提供象征与自我探索的视角，人生的选择始终由你书写。";
  $("#interpret-loading p").textContent="正在展开这次相遇的基础牌义。";
  $("#interpret-loading small").textContent="从经典象征出发，留一点空间给自己的感受。";
  $("#reference-interpret").hidden=true;
  $("#reading .saved-note").textContent="本次相遇已保存至当前浏览器的「星光手记」";
  $("#asset-credit").insertAdjacentHTML("beforeend",' <a href="./attribution.html" target="_blank" rel="noopener">查看牌图来源与许可 ↗</a>');
}
async function loadSettings(){
  try{state.settings=await api("/api/settings");populateSettings();}catch(error){status("#settings-status",error.message,"error");}
}
function populateSettings(){
  const settings=state.settings;if(!settings)return;$("#provider-select").innerHTML=settings.providers.map(provider=>`<option value="${escapeHTML(provider.id)}">${escapeHTML(provider.name)}${provider.configured?" · 已就绪":""}</option>`).join("");$("#provider-select").value=settings.provider;$("#api-key").value="";updateProviderFields();updateCustomCount(settings.customCardCount);status("#settings-status","");
}
function updateProviderFields(){
  const id=$("#provider-select").value;const provider=state.settings?.providers.find(item=>item.id===id);if(!provider)return;
  $("#model-name").value=provider.model||"";$("#model-name").disabled=id==="reference";$("#api-key-group").hidden=id==="local"||id==="reference";$("#base-url-group").hidden=id==="local"||id==="reference";$("#base-url").value=provider.baseUrl||"";$("#api-key").value="";
  $("#provider-note").textContent=id==="reference"?"使用内置牌义进行基础阅读，不调用 AI，也不会按问题生成个性化解读。":id==="local"?"通过本机 Ollama 解读。首次生成需要加载模型，等待时间可能较长。":`${provider.configured?"已保存该服务的密钥。":"尚未保存该服务的密钥。"} 问题与已抽牌面会发送给你选择的云端服务。`;
  const local=state.settings.local;$("#local-model-state").hidden=id!=="local";$("#local-model-state").textContent=local?.available?`本机 Ollama 已连接${local.models?.length?` · 可用模型：${local.models.map(model=>typeof model==="string"?model:model.name||model.model).join("、")}`:" · 尚未发现模型"}`:"尚未连接到本机 Ollama。请先启动本地模型服务。";
}
$("#provider-select").addEventListener("change",updateProviderFields);
function settingsPayload(){const result={provider:$("#provider-select").value,model:$("#model-name").value.trim()};if($("#api-key").value.trim())result.apiKey=$("#api-key").value.trim();if(!$("#base-url-group").hidden&&$("#base-url").value.trim())result.baseUrl=$("#base-url").value.trim();return result;}
async function saveSettings(){state.settings=await api("/api/settings",settingsPayload());populateSettings();return state.settings;}
$("#settings-form").addEventListener("submit",async event=>{event.preventDefault();const button=$("button[type=submit]",event.currentTarget);button.disabled=true;status("#settings-status","正在保存…");try{await saveSettings();status("#settings-status","已保存，下一次解读将使用这个声音。","success");}catch(error){status("#settings-status",error.message,"error");}finally{button.disabled=false;}});
$("#test-model").addEventListener("click",async()=>{const button=$("#test-model");button.disabled=true;status("#settings-status","正在保存设置并测试连接，模型首次加载可能需要等待…");try{await saveSettings();status("#settings-status","正在测试连接…");const result=await api("/api/models/test",{provider:$("#provider-select").value},240000);status("#settings-status",`${result.message|| (result.ok?"连接成功":"连接未能完成")}${result.latencyMs?` · ${(result.latencyMs/1000).toFixed(1)} 秒`:""}`,result.ok?"success":"error");}catch(error){status("#settings-status",error.message,"error");}finally{button.disabled=false;}});

function updateCustomCount(count){$("#custom-card-count").textContent=Number(count)>0?`已换上 ${count} 张原创牌面`:"当前使用完整经典牌面";}
function fileToDataURL(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error("无法读取这张图片，请重新选择。"));reader.readAsDataURL(file);});}
async function uploadImage(cardId,file){if(!["image/jpeg","image/png","image/webp"].includes(file.type))throw new Error(`${file.name}：请选择 JPG、PNG 或 WebP 图片。`);if(file.size>8*1024*1024)throw new Error(`${file.name}：图片超过 8 MB，请压缩后上传。`);const imageDataUrl=await fileToDataURL(file);return api("/api/assets/upload",{cardId,filename:file.name,imageDataUrl});}
$("#single-upload").addEventListener("change",async event=>{const file=event.target.files[0];if(!file)return;event.target.disabled=true;status("#upload-status","正在为这张牌换上你的画作…");try{const result=await uploadImage($("#upload-card-id").value,file);updateCustomCount(result.customCardCount);const selected=$("#upload-card-id").value;await refreshCatalog();$("#upload-card-id").value=selected;status("#upload-status","画作已保存。图鉴与下一次抽牌将呈现你的原创牌面。","success");}catch(error){status("#upload-status",error.message,"error");}finally{event.target.disabled=false;event.target.value="";}});
$("#batch-upload").addEventListener("change",async event=>{
  const files=Array.from(event.target.files);if(!files.length)return;event.target.disabled=true;let successes=0;const failures=[];
  for(let index=0;index<files.length;index++){const file=files[index];const id=file.name.replace(/\.[^.]+$/,"").toLowerCase();status("#upload-status",`正在换上整套画作 · ${index+1} / ${files.length} · 已完成 ${successes} 张`);if(!state.catalog.cards.some(card=>card.id===id)){failures.push(`${file.name}（未匹配牌 ID）`);continue;}try{const result=await uploadImage(id,file);successes++;updateCustomCount(result.customCardCount);}catch(error){failures.push(error.message);}}
  try{await refreshCatalog();}catch(error){failures.push(error.message);}status("#upload-status",`已成功替换 ${successes} 张。${failures.length?` ${failures.length} 项未完成：${failures.slice(0,4).join("；")}${failures.length>4?"…请按命名清单检查剩余文件。":""}`:"你的世界已经有了新的样子。"}`,failures.length?"error":"success");event.target.disabled=false;event.target.value="";
});
$("#download-manifest").addEventListener("click",()=>{if(!state.catalog)return;const csv="\uFEFF标准牌ID,中文名,英文名,建议文件名\r\n"+state.catalog.cards.map(card=>[card.id,card.name,card.nameEn,`${card.id}.jpg`].map(value=>`"${String(value).replace(/"/g,'""')}"`).join(",")).join("\r\n");const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));const link=document.createElement("a");link.href=url;link.download="Lunaria-78张牌面命名清单.csv";link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
$("#reset-deck").addEventListener("click",async()=>{const button=$("#reset-deck");button.disabled=true;try{await api("/api/deck/reset",{});await refreshCatalog();updateCustomCount(0);status("#upload-status",isStatic?"已恢复经典牌面。历史记录仍保留当时的牌图。":"已恢复经典牌面。上传后的牌面图片仍保留在本机。","success");}catch(error){status("#upload-status",error.message,"error");}finally{button.disabled=false;}});

async function initialize(){
  const results=await Promise.allSettled([refreshCatalog(),api("/api/settings"),isStatic?staticAdapter.then(adapter=>adapter.getPreferences()):Promise.resolve(null)]);
  if(results[0].status==="fulfilled"){$("#start-button").disabled=false;status("#start-status","");}else{status("#start-status",`${results[0].reason.message} 点击这里重新连接。`,"error");$("#start-status").role="button";$("#start-status").tabIndex=0;$("#start-status").onclick=()=>location.reload();$("#start-status").onkeydown=event=>{if(event.key==="Enter"||event.key===" ")location.reload();};}
  if(results[1].status==="fulfilled")state.settings=results[1].value;
  if(isStatic&&results[2].status==="fulfilled"){Object.entries(results[2].value).forEach(([key,value])=>{if(!staticPreferences.has(key))staticPreferences.set(key,value);});applyTheme(storage.get("theme")||"lunar",false);}
  if(storage.get("reading"))$("#resume-reading").hidden=false;
}
initialize();



