
let state = { chefs:[], containers:[], catalog:[], items:[], history:[] };
let session = {type:null, chefId:null, containerId:null, name:null};
let adminTab = "containers";
let refreshTimer = null;
let lastSync = null;

const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
const fmtDate = s => s ? new Date(s).toLocaleString("fr-FR",{dateStyle:"short",timeStyle:"short"}) : "—";
const now = () => new Date().toISOString();

function toast(msg){
  const t=$("#toast"); t.textContent=msg; t.classList.remove("hidden");
  clearTimeout(window.__toast); window.__toast=setTimeout(()=>t.classList.add("hidden"),2600);
}
function setSync(ok, label){
  const el=$("#syncState"); if(!el) return;
  el.className="sync "+(ok?"online":"offline");
  el.querySelector(".sync-text").textContent=label || (ok?"Synchronisé":"Hors connexion");
}
function itemStatus(i){
  const missing=Math.max(Number(i.expected)-Number(i.present)-Number(i.repair),0);
  if(missing>0) return ["danger",`${missing} manquant${missing>1?"s":""}`];
  if(Number(i.repair)>0) return ["warning",`${i.repair} en réparation`];
  return ["good","Complet"];
}
function currentContainer(){ return state.containers.find(c=>c.id===session.containerId); }
function itemsFor(cid){ return state.items.filter(i=>i.container_id===cid); }
function containerStats(c){
  let exp=0,p=0,r=0,m=0;
  for(const i of itemsFor(c.id)){ exp+=+i.expected||0; p+=+i.present||0; r+=+i.repair||0; m+=Math.max((+i.expected||0)-(+i.present||0)-(+i.repair||0),0); }
  return {exp,p,r,m};
}
function chefName(c){
  return state.chefs.find(x=>x.id===c.chief_id)?.name || "Chef non attribué";
}
function cacheState(){ localStorage.setItem("rbf_v3_cache", JSON.stringify(state)); }
function loadCache(){ try{const d=JSON.parse(localStorage.getItem("rbf_v3_cache")); if(d?.containers) state=d;}catch{} }

function seedDemoState(){
  if(state.chefs.length) return;
  const names=["SOUSA Ricardo","VANNEREUX Teddy","DAS SILVA José","PEREIRA Mario","DOMINGUEZ COSTA Victor","ZEFERINO Costa"];
  const refs=[
    ["Rallonges",4],["Perceuses",2],["Piqueurs",2],["Boulonneuses",2],
    ["Pied de biche",1],["Pelle",1],["Pioche",1],["Boîtes de laser",2],
    ["Trépieds",2],["Grande disqueuse",1],["Petite disqueuse",1],
    ["Vibreurs larges",2],["Vibreur fin",1],["Moteur pour vibreur",1]
  ];
  state.chefs=names.map((name,i)=>({id:`demo-chef-${i+1}`,name}));
  state.containers=state.chefs.map((ch,i)=>({id:`demo-cont-${i+1}`,chief_id:ch.id,name:`Container ${String(i+1).padStart(2,"0")}`,location:"",last_inventory:null}));
  state.catalog=refs.map(([name,q],i)=>({id:`demo-cat-${i+1}`,name,default_expected:q}));
  state.items=state.containers.flatMap(c=>state.catalog.map(k=>({id:`demo-${c.id}-${k.id}`,container_id:c.id,catalog_id:k.id,name:k.name,expected:k.default_expected,present:k.default_expected,repair:0})));
  state.history=[];
}

async function sync({quiet=false}={}){
  if(!DB.configured()){
    setSync(false,"Configuration requise");
    return false;
  }
  try{
    const fresh=await DB.loadAll();
    state=fresh; lastSync=new Date(); cacheState();
    setSync(true,`Synchro ${lastSync.toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"})}`);
    renderLoginNames();
    if(session.type==="chef") renderChef();
    else if(session.type==="admin") session.containerId ? renderAdminContainer(session.containerId) : renderAdmin();
    return true;
  }catch(e){
    console.error(e); setSync(false,navigator.onLine?"Erreur de synchro":"Hors connexion");
    if(!quiet) toast("Impossible de synchroniser les données.");
    return false;
  }
}

function startAutoRefresh(){
  clearInterval(refreshTimer);
  refreshTimer=setInterval(()=>{
    if(document.visibilityState==="visible" && !$("#modalRoot").children.length) sync({quiet:true});
  }, Number(cfg.REFRESH_INTERVAL_MS||6000));
}

function renderLoginNames(){
  const root=$("#nameGrid");
  if(!root) return;
  if(!state.chefs.length){
    root.innerHTML='<div class="empty" style="grid-column:1/-1">Aucun chef chargé.</div>';
    return;
  }
  root.innerHTML=state.chefs.map(ch=>`<button class="name-btn" onclick="loginChef('${ch.id}')">👷 ${esc(ch.name)}</button>`).join("");
}
function showApp(){
  $("#loginView").classList.add("hidden"); $("#appView").classList.remove("hidden");
}
function logout(){
  session={type:null,chefId:null,containerId:null,name:null};
  $("#appView").classList.add("hidden"); $("#loginView").classList.remove("hidden");
}
function loginChef(chefId){
  const ch=state.chefs.find(x=>x.id===chefId);
  const c=state.containers.find(x=>x.chief_id===chefId);
  if(!ch||!c){toast("Container introuvable pour ce chef.");return;}
  session={type:"chef",chefId,containerId:c.id,name:ch.name};
  $("#roleSmall").textContent=`${ch.name} · Chef de chantier`;
  showApp(); renderChef();
}
function loginAdminPrompt(){
  modal("Accès administrateur",`
    <div class="field"><label>Code administrateur</label><input id="adminCode" type="password" autocomplete="off" placeholder="Code"></div>
    <div class="muted" style="margin-top:9px">Le code est défini dans le fichier config.js.</div>`,
    `<button class="btn btn-light" onclick="closeModal()">Annuler</button><button class="btn btn-primary" onclick="loginAdmin()">Connexion</button>`);
  setTimeout(()=>$("#adminCode")?.focus(),50);
}
function loginAdmin(){
  const code=$("#adminCode")?.value || "";
  if(code !== String(cfg.ADMIN_CODE||"")){ toast("Code administrateur incorrect."); return; }
  closeModal(); session={type:"admin",name:"Administrateur",containerId:null};
  $("#roleSmall").textContent="Administrateur";
  showApp(); renderAdmin();
}
function statsCards(s){
  return `<div class="grid grid-3">
    <div class="card stat"><div><div class="stat-label">MATÉRIEL PRÉSENT</div><div class="stat-num">${s.p}</div></div><span class="dot ok"></span></div>
    <div class="card stat"><div><div class="stat-label">EN RÉPARATION</div><div class="stat-num">${s.r}</div></div><span class="dot warn"></span></div>
    <div class="card stat"><div><div class="stat-label">MANQUANT</div><div class="stat-num">${s.m}</div></div><span class="dot bad"></span></div>
  </div>`;
}
function inventoryHTML(c, admin=false){
  const rows=itemsFor(c.id).map(i=>{
    const missing=Math.max(i.expected-i.present-i.repair,0), [cl,txt]=itemStatus(i);
    return `<tr>
      <td><div class="item-name">${esc(i.name)}</div><div class="muted">Prévu : ${i.expected}</div></td>
      <td class="qty">${i.present}</td><td class="qty">${i.repair}</td><td class="qty">${missing}</td>
      <td><span class="status ${cl}">${txt}</span></td>
      <td><div class="actions">
        <button class="btn btn-light btn-sm" onclick="openCount('${i.id}')">✏️ Compter</button>
        <button class="btn btn-danger btn-sm" onclick="openRepair('${i.id}')">🔧 Réparer</button>
        ${i.repair>0?`<button class="btn btn-success btn-sm" onclick="openReturn('${i.id}')">↩ Retour</button>`:""}
        ${admin?`<button class="btn btn-light btn-sm" onclick="openExpected('${i.id}')">⚙️ Prévu</button>`:`<button class="btn btn-light btn-sm" onclick="openContainerItemEdit('${i.id}')">⚙️ Modifier</button>`}
      </div></td></tr>`;
  }).join("");
  const cards=itemsFor(c.id).map(i=>{
    const missing=Math.max(i.expected-i.present-i.repair,0), [cl,txt]=itemStatus(i);
    return `<div class="item-card">
      <div class="item-head"><div><div class="item-name">${esc(i.name)}</div><div class="muted">Prévu : ${i.expected}</div></div><span class="status ${cl}">${txt}</span></div>
      <div class="item-stats"><div class="mini"><b>${i.present}</b><span>Présent</span></div><div class="mini"><b>${i.repair}</b><span>Réparation</span></div><div class="mini"><b>${missing}</b><span>Manquant</span></div><div class="mini"><b>${i.expected}</b><span>Prévu</span></div></div>
      <div class="actions"><button class="btn btn-light btn-sm" onclick="openCount('${i.id}')">✏️ Compter</button><button class="btn btn-danger btn-sm" onclick="openRepair('${i.id}')">🔧 Réparer</button>${i.repair>0?`<button class="btn btn-success btn-sm" onclick="openReturn('${i.id}')">↩ Retour</button>`:""}${admin?`<button class="btn btn-light btn-sm" onclick="openExpected('${i.id}')">⚙️ Prévu</button>`:`<button class="btn btn-light btn-sm" onclick="openContainerItemEdit('${i.id}')">⚙️ Modifier</button>`}</div>
    </div>`;
  }).join("");
  return `<div class="table-card inventory"><table class="table"><thead><tr><th>Matériel</th><th>Présent</th><th>Réparation</th><th>Manquant</th><th>État</th><th>Actions</th></tr></thead><tbody>${rows}</tbody></table></div><div class="mobile-cards">${cards}</div>`;
}
function historyLabel(x){
  if(x.event_type==="repair")return `${x.qty} ${x.item_name} envoyé(s) en réparation`;
  if(x.event_type==="return")return `${x.qty} ${x.item_name} revenu(s) de réparation`;
  if(x.event_type==="inventory")return `Inventaire validé`;
  if(x.event_type==="count")return `Comptage modifié : ${x.item_name}`;
  if(x.event_type==="catalog_add")return `Matériel ajouté : ${x.item_name}`;
  if(x.event_type==="catalog_delete")return `Matériel supprimé : ${x.item_name}`;
  if(x.event_type==="expected")return `Quantité prévue modifiée : ${x.item_name}`;
  if(x.event_type==="container_item_add")return `Matériel ajouté au container : ${x.item_name}`;
  if(x.event_type==="container_item_edit")return `Matériel modifié dans le container : ${x.item_name}`;
  if(x.event_type==="container_item_delete")return `Matériel supprimé du container : ${x.item_name}`;
  return x.event_type;
}
function historyHTML(containerId=null, limit=20){
  const h=state.history.filter(x=>!containerId||x.container_id===containerId).slice(0,limit);
  if(!h.length) return '<div class="card empty">Aucun mouvement enregistré pour le moment.</div>';
  return `<div class="history">${h.map(x=>{
    const icon=x.event_type==="repair"?"🔧":x.event_type==="return"?"↩️":x.event_type==="inventory"?"✓":x.event_type==="count"?"✏️":"•";
    return `<div class="history-row"><div class="history-icon">${icon}</div><div class="history-main"><b>${esc(historyLabel(x))}</b><small>${esc(x.actor_name||"")} · ${fmtDate(x.created_at)}${x.note?" · "+esc(x.note):""}</small></div></div>`;
  }).join("")}</div>`;
}
function renderChef(){
  const c=currentContainer(); if(!c)return;
  $("#adminScreen").classList.add("hidden"); const root=$("#chefScreen"); root.classList.remove("hidden");
  const s=containerStats(c);
  root.innerHTML=`
    <div class="brand-panel"><h2>Rosset Boulon &amp; Fils</h2><p>Inventaire du container et suivi des réparations synchronisés avec l'administration.</p><div class="brand-tags"><span class="brand-tag">${esc(c.name)}</span><span class="brand-tag">${esc(session.name)}</span></div></div>
    <div class="hero"><div><span class="badge">${esc(c.name)}</span><h1>Bonjour ${esc(session.name.split(" ").slice(-1)[0])}</h1><p>${c.location?esc(c.location)+" · ":""}Dernier inventaire : ${c.last_inventory?fmtDate(c.last_inventory):"jamais"}</p></div>
    <div class="hero-actions"><button class="btn btn-light" onclick="sync()">↻ Actualiser</button><button class="btn btn-accent" onclick="openContainerEquipmentManager()">⚙️ Modifier le matériel</button><button class="btn btn-primary" onclick="validateInventory()">✓ Valider l’inventaire</button></div></div>
    ${statsCards(s)}
    <div class="section-title"><h2>Inventaire du container</h2><span>${itemsFor(c.id).length} types de matériel</span></div>
    ${inventoryHTML(c,false)}
    <div class="section-title"><h2>Derniers mouvements</h2><span>Synchronisés entre téléphone et ordinateur</span></div>
    ${historyHTML(c.id,8)}`;
}
function renderAdmin(){
  $("#chefScreen").classList.add("hidden"); const root=$("#adminScreen"); root.classList.remove("hidden");
  root.innerHTML=`
    <div class="brand-panel"><h2>Rosset Boulon &amp; Fils</h2><p>Vue partagée des containers, inventaires et matériels en réparation.</p><div class="brand-tags"><span class="brand-tag">Gros œuvre</span><span class="brand-tag">Maçonnerie</span><span class="brand-tag">Réhabilitation</span><span class="brand-tag">Rhône-Alpes</span></div></div>
    <div class="hero"><div><span class="badge">ADMINISTRATION</span><h1>Suivi général des containers</h1><p>Les modifications effectuées par les chefs apparaissent automatiquement ici.</p></div><div class="hero-actions"><button class="btn btn-light" onclick="sync()">↻ Actualiser</button><button class="btn btn-primary" onclick="openCatalogAdd()">＋ Matériel</button></div></div>
    <div class="tabs"><button class="tab ${adminTab==="containers"?"active":""}" onclick="setAdminTab('containers')">Containers</button><button class="tab ${adminTab==="catalog"?"active":""}" onclick="setAdminTab('catalog')">Matériel de référence</button><button class="tab ${adminTab==="history"?"active":""}" onclick="setAdminTab('history')">Historique</button></div>
    <div id="adminContent" style="margin-top:15px"></div>`;
  renderAdminTab();
}
function setAdminTab(tab){adminTab=tab;renderAdmin();}
function renderAdminTab(){
  const root=$("#adminContent"); if(!root)return;
  if(adminTab==="containers"){
    root.innerHTML=`<div class="grid grid-2">${state.containers.map(c=>{
      const s=containerStats(c), [cl,txt]=s.m?["danger",`${s.m} manquant(s)`]:s.r?["warning",`${s.r} en réparation`]:["good","Inventaire OK"];
      return `<div class="card container-card" onclick="openAdminContainer('${c.id}')"><div class="container-title"><div><h3>${esc(chefName(c))}</h3><div class="muted">${esc(c.name)}${c.location?" · "+esc(c.location):""}</div></div><span class="status ${cl}">${txt}</span></div><div class="summary"><div><b>${s.p}</b><span>présents</span></div><div><b>${s.r}</b><span>réparation</span></div><div><b>${s.m}</b><span>manquants</span></div></div><div class="muted" style="margin-top:9px">Dernier inventaire : ${c.last_inventory?fmtDate(c.last_inventory):"jamais"}</div></div>`;
    }).join("")}</div>`;
  } else if(adminTab==="catalog"){
    root.innerHTML=`<div class="section-title"><div><h2>Matériel de référence</h2><span>Ajouter, modifier ou supprimer du matériel pour tous les containers.</span></div><button class="btn btn-primary" onclick="openCatalogAdd()">＋ Ajouter</button></div>
    <div class="table-card" style="display:block"><table class="table"><thead><tr><th>Matériel</th><th>Quantité prévue</th><th>Actions</th></tr></thead><tbody>${state.catalog.map(i=>`<tr><td class="item-name">${esc(i.name)}</td><td class="qty">${i.default_expected}</td><td><div class="actions"><button class="btn btn-light btn-sm" onclick="openCatalogEdit('${i.id}')">✏️ Modifier</button><button class="btn btn-danger btn-sm" onclick="deleteCatalog('${i.id}')">🗑 Supprimer</button></div></td></tr>`).join("")}</tbody></table></div>`;
  } else {
    root.innerHTML=`<div class="section-title"><h2>Historique général</h2><span>${state.history.length} mouvements récents</span></div>${historyHTML(null,100)}`;
  }
}
function openAdminContainer(id){session.containerId=id;renderAdminContainer(id)}
function renderAdminContainer(id){
  const c=state.containers.find(x=>x.id===id); if(!c)return; const s=containerStats(c);
  $("#chefScreen").classList.add("hidden"); const root=$("#adminScreen"); root.classList.remove("hidden");
  root.innerHTML=`<div class="hero"><div><button class="btn btn-light btn-sm" onclick="session.containerId=null;renderAdmin()">← Retour</button><h1 style="margin-top:12px">${esc(chefName(c))}</h1><p>${esc(c.name)}${c.location?" · "+esc(c.location):""}</p></div><div class="hero-actions"><button class="btn btn-light" onclick="openContainerMeta()">⚙️ Container</button><button class="btn btn-primary" onclick="validateInventory()">✓ Valider l’inventaire</button></div></div>${statsCards(s)}<div class="section-title"><h2>Inventaire</h2><span>${itemsFor(c.id).length} types de matériel</span></div>${inventoryHTML(c,true)}<div class="section-title"><h2>Historique</h2></div>${historyHTML(c.id,25)}`;
}
function modal(title,body,footer=""){
  $("#modalRoot").innerHTML=`<div class="modal-backdrop" onclick="if(event.target===this)closeModal()"><div class="modal"><div class="modal-head"><h3>${title}</h3><button class="close" onclick="closeModal()">×</button></div><div class="modal-body">${body}</div>${footer?`<div class="modal-foot">${footer}</div>`:""}</div></div>`;
}
function closeModal(){ $("#modalRoot").innerHTML=""; }
function rerender(){ session.type==="chef"?renderChef():session.containerId?renderAdminContainer(session.containerId):renderAdmin(); }

async function writeHistory(type,c,itemName="",qty=0,note=""){
  await DB.addHistory({container_id:c?.id||null,actor_name:session.name||"Administrateur",event_type:type,item_name:itemName||"",qty:qty||0,note:note||""});
}
function getItem(id){ return state.items.find(i=>i.id===id); }

function openCount(id){const i=getItem(id);modal("Mettre à jour le comptage",`<div class="form-grid"><div class="field full"><label>Matériel</label><input value="${esc(i.name)}" disabled></div><div class="field"><label>Quantité prévue</label><input value="${i.expected}" disabled></div><div class="field"><label>En réparation</label><input value="${i.repair}" disabled></div><div class="field full"><label>Quantité présente dans le container</label><input id="countPresent" type="number" min="0" value="${i.present}"></div></div>`,`<button class="btn btn-light" onclick="closeModal()">Annuler</button><button class="btn btn-primary" onclick="saveCount('${id}')">Enregistrer</button>`)}
async function saveCount(id){
  const i=getItem(id), c=state.containers.find(x=>x.id===i.container_id), v=Math.max(0,Number($("#countPresent").value||0));
  try{await DB.updateItem(id,{present:v});await writeHistory("count",c,i.name,v);closeModal();await sync({quiet:true});toast("Comptage synchronisé");}catch(e){console.error(e);toast("Erreur lors de l’enregistrement");}
}
function openRepair(id){const i=getItem(id);modal("Envoyer en réparation",`<div class="form-grid"><div class="field full"><label>Matériel</label><input value="${esc(i.name)}" disabled></div><div class="field"><label>Disponible</label><input value="${i.present}" disabled></div><div class="field"><label>Quantité à envoyer</label><input id="repairQty" type="number" min="1" max="${Math.max(i.present,1)}" value="1"></div><div class="field full"><label>Remarque</label><textarea id="repairNote" placeholder="Panne, atelier, commentaire..."></textarea></div></div>`,`<button class="btn btn-light" onclick="closeModal()">Annuler</button><button class="btn btn-danger" onclick="saveRepair('${id}')">Envoyer réparer</button>`)}
async function saveRepair(id){
  const i=getItem(id), c=state.containers.find(x=>x.id===i.container_id); let q=Math.max(1,Number($("#repairQty").value||1));q=Math.min(q,+i.present);
  if(+i.present<=0){toast("Aucun exemplaire présent à envoyer.");return}
  try{await DB.updateItem(id,{present:+i.present-q,repair:+i.repair+q});await writeHistory("repair",c,i.name,q,$("#repairNote").value.trim());closeModal();await sync({quiet:true});toast("Réparation synchronisée");}catch(e){console.error(e);toast("Erreur lors de l’enregistrement");}
}
function openReturn(id){const i=getItem(id);modal("Retour de réparation",`<div class="form-grid"><div class="field full"><label>Matériel</label><input value="${esc(i.name)}" disabled></div><div class="field"><label>En réparation</label><input value="${i.repair}" disabled></div><div class="field"><label>Quantité de retour</label><input id="returnQty" type="number" min="1" max="${i.repair}" value="1"></div><div class="field full"><label>Remarque</label><textarea id="returnNote" placeholder="Réparation effectuée..."></textarea></div></div>`,`<button class="btn btn-light" onclick="closeModal()">Annuler</button><button class="btn btn-success" onclick="saveReturn('${id}')">Valider le retour</button>`)}
async function saveReturn(id){
  const i=getItem(id), c=state.containers.find(x=>x.id===i.container_id); let q=Math.max(1,Number($("#returnQty").value||1));q=Math.min(q,+i.repair);
  try{await DB.updateItem(id,{present:+i.present+q,repair:+i.repair-q});await writeHistory("return",c,i.name,q,$("#returnNote").value.trim());closeModal();await sync({quiet:true});toast("Retour synchronisé");}catch(e){console.error(e);toast("Erreur lors de l’enregistrement");}
}
async function validateInventory(){
  const c=currentContainer(); if(!c)return;
  try{const d=now();await DB.updateContainer(c.id,{last_inventory:d});await writeHistory("inventory",c,"",0,"");await sync({quiet:true});toast("Inventaire validé et synchronisé");}catch(e){console.error(e);toast("Erreur lors de la validation");}
}

function openContainerEquipmentManager(){
  const c=currentContainer(); if(!c)return;
  const rows=itemsFor(c.id).map(i=>`
    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 0;border-bottom:1px solid var(--line)">
      <div><div class="item-name">${esc(i.name)}</div><div class="muted">Prévu : ${i.expected} · Présent : ${i.present} · Réparation : ${i.repair}</div></div>
      <div class="actions">
        <button class="btn btn-light btn-sm" onclick="openContainerItemEdit('${i.id}')">✏️ Modifier</button>
        <button class="btn btn-danger btn-sm" onclick="deleteContainerItem('${i.id}')">🗑 Supprimer</button>
      </div>
    </div>`).join("");
  modal("Modifier le matériel de mon container",
    `<div class="muted" style="margin-bottom:12px">Les changements concernent uniquement <b>${esc(c.name)}</b> et n’affectent pas les autres chefs.</div>
     <button class="btn btn-primary btn-block" onclick="openContainerItemAdd()">＋ Ajouter un matériel</button>
     <div style="margin-top:12px">${rows||'<div class="empty">Aucun matériel dans ce container.</div>'}</div>`,
    `<button class="btn btn-light" onclick="closeModal()">Fermer</button>`);
}

function openContainerItemAdd(){
  const c=currentContainer(); if(!c)return;
  modal("Ajouter du matériel à mon container",
    `<div class="form-grid">
      <div class="field full"><label>Nom du matériel</label><input id="containerItemName" placeholder="Ex. Scie circulaire"></div>
      <div class="field full"><label>Quantité prévue</label><input id="containerItemExpected" type="number" min="0" value="1"></div>
    </div>`,
    `<button class="btn btn-light" onclick="openContainerEquipmentManager()">Annuler</button><button class="btn btn-primary" onclick="saveContainerItemAdd()">Ajouter</button>`);
}

async function saveContainerItemAdd(){
  const c=currentContainer(); if(!c)return;
  const name=$("#containerItemName").value.trim();
  const expected=Math.max(0,Number($("#containerItemExpected").value||0));
  if(!name){toast("Indiquez le nom du matériel.");return}
  try{
    await DB.addContainerItem(c.id,name,expected);
    await writeHistory("container_item_add",c,name,expected,"Ajouté uniquement à ce container");
    await sync({quiet:true});
    openContainerEquipmentManager();
    toast("Matériel ajouté à ce container");
  }catch(e){console.error(e);toast("Erreur lors de l’ajout");}
}

function openContainerItemEdit(id){
  const i=getItem(id); if(!i)return;
  modal("Modifier ce matériel",
    `<div class="form-grid">
      <div class="field full"><label>Nom du matériel</label><input id="containerItemName" value="${esc(i.name)}"></div>
      <div class="field"><label>Quantité prévue</label><input id="containerItemExpected" type="number" min="0" value="${i.expected}"></div>
      <div class="field"><label>Quantité présente</label><input id="containerItemPresent" type="number" min="0" value="${i.present}"></div>
      <div class="field full"><label>En réparation</label><input id="containerItemRepair" type="number" min="0" value="${i.repair}"></div>
    </div>
    <div class="muted" style="margin-top:10px">Cette modification s’applique uniquement au container de ce chef.</div>`,
    `<button class="btn btn-danger" onclick="deleteContainerItem('${id}',true)">🗑 Supprimer</button><button class="btn btn-light" onclick="closeModal()">Annuler</button><button class="btn btn-primary" onclick="saveContainerItemEdit('${id}')">Enregistrer</button>`);
}

async function saveContainerItemEdit(id){
  const i=getItem(id); if(!i)return;
  const c=state.containers.find(x=>x.id===i.container_id);
  const name=$("#containerItemName").value.trim()||i.name;
  const expected=Math.max(0,Number($("#containerItemExpected").value||0));
  const present=Math.max(0,Number($("#containerItemPresent").value||0));
  const repair=Math.max(0,Number($("#containerItemRepair").value||0));
  try{
    await DB.updateItem(id,{name,expected,present,repair});
    await writeHistory("container_item_edit",c,name,expected,"Matériel modifié par le chef");
    closeModal();
    await sync({quiet:true});
    toast("Matériel modifié");
  }catch(e){console.error(e);toast("Erreur lors de la modification");}
}

async function deleteContainerItem(id,fromEdit=false){
  const i=getItem(id); if(!i)return;
  const c=state.containers.find(x=>x.id===i.container_id);
  if(!confirm(`Supprimer « ${i.name} » uniquement de ${c.name} ?`))return;
  try{
    await DB.deleteContainerItem(id);
    await writeHistory("container_item_delete",c,i.name,0,"Supprimé uniquement de ce container");
    closeModal();
    await sync({quiet:true});
    toast("Matériel supprimé de ce container");
  }catch(e){console.error(e);toast("Erreur lors de la suppression");}
}

function openCatalogAdd(){modal("Ajouter du matériel",`<div class="form-grid"><div class="field full"><label>Nom du matériel</label><input id="catName" placeholder="Ex. Enrouleur 25 m"></div><div class="field full"><label>Quantité prévue par container</label><input id="catQty" type="number" min="0" value="1"></div></div>`,`<button class="btn btn-light" onclick="closeModal()">Annuler</button><button class="btn btn-primary" onclick="saveCatalogAdd()">Ajouter</button>`)}
async function saveCatalogAdd(){
  const name=$("#catName").value.trim(), q=Math.max(0,Number($("#catQty").value||0));if(!name){toast("Indiquez un nom.");return}
  try{await DB.addCatalog(name,q,state.containers);await DB.addHistory({container_id:null,actor_name:"Administrateur",event_type:"catalog_add",item_name:name,qty:q,note:"Ajouté à tous les containers"});closeModal();await sync({quiet:true});toast("Matériel ajouté aux 6 containers");}catch(e){console.error(e);toast("Erreur lors de l’ajout");}
}
function openCatalogEdit(id){const i=state.catalog.find(x=>x.id===id);modal("Modifier le matériel",`<div class="form-grid"><div class="field full"><label>Nom</label><input id="catName" value="${esc(i.name)}"></div><div class="field full"><label>Quantité prévue par container</label><input id="catQty" type="number" min="0" value="${i.default_expected}"></div></div>`,`<button class="btn btn-light" onclick="closeModal()">Annuler</button><button class="btn btn-primary" onclick="saveCatalogEdit('${id}')">Enregistrer</button>`)}
async function saveCatalogEdit(id){
  const name=$("#catName").value.trim(),q=Math.max(0,Number($("#catQty").value||0));if(!name)return;
  try{await DB.editCatalog(id,name,q);closeModal();await sync({quiet:true});toast("Matériel modifié");}catch(e){console.error(e);toast("Erreur lors de la modification");}
}
async function deleteCatalog(id){
  const i=state.catalog.find(x=>x.id===id);if(!confirm(`Supprimer « ${i.name} » des 6 containers ?`))return;
  try{await DB.deleteCatalog(id);await DB.addHistory({container_id:null,actor_name:"Administrateur",event_type:"catalog_delete",item_name:i.name,qty:0,note:""});await sync({quiet:true});toast("Matériel supprimé");}catch(e){console.error(e);toast("Erreur lors de la suppression");}
}
function openContainerMeta(){const c=currentContainer();modal("Modifier le container",`<div class="form-grid"><div class="field full"><label>Chef de chantier</label><input value="${esc(chefName(c))}" disabled></div><div class="field full"><label>Nom / numéro</label><input id="contName" value="${esc(c.name)}"></div><div class="field full"><label>Localisation / chantier</label><input id="contLoc" value="${esc(c.location||"")}" placeholder="Ex. Chantier Annecy"></div></div>`,`<button class="btn btn-light" onclick="closeModal()">Annuler</button><button class="btn btn-primary" onclick="saveContainerMeta()">Enregistrer</button>`)}
async function saveContainerMeta(){const c=currentContainer();try{await DB.updateContainer(c.id,{name:$("#contName").value.trim()||c.name,location:$("#contLoc").value.trim()});closeModal();await sync({quiet:true});toast("Container mis à jour");}catch(e){console.error(e);toast("Erreur lors de la modification");}}
function openExpected(id){const i=getItem(id);modal("Quantité prévue",`<div class="form-grid"><div class="field full"><label>Matériel</label><input value="${esc(i.name)}" disabled></div><div class="field full"><label>Quantité prévue pour ce container</label><input id="expectedQty" type="number" min="0" value="${i.expected}"></div></div>`,`<button class="btn btn-light" onclick="closeModal()">Annuler</button><button class="btn btn-primary" onclick="saveExpected('${id}')">Enregistrer</button>`)}
async function saveExpected(id){const i=getItem(id),c=state.containers.find(x=>x.id===i.container_id),q=Math.max(0,Number($("#expectedQty").value||0));try{await DB.updateItem(id,{expected:q});await writeHistory("expected",c,i.name,q);closeModal();await sync({quiet:true});toast("Quantité prévue mise à jour");}catch(e){console.error(e);toast("Erreur lors de la modification");}}

window.addEventListener("online",()=>sync({quiet:true}));
window.addEventListener("offline",()=>setSync(false,"Hors connexion"));
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")sync({quiet:true})});

async function init(){
  loadCache(); seedDemoState(); renderLoginNames();
  if(!DB.configured()){
    $("#setupAlert").classList.remove("hidden");
    $("#setupAlert").innerHTML="La V3 est prête, mais la base partagée n’est pas encore configurée. Renseignez <b>SUPABASE_URL</b> et <b>SUPABASE_ANON_KEY</b> dans <b>config.js</b> après avoir exécuté le fichier <b>supabase_schema.sql</b>.";
  } else {
    $("#setupAlert").classList.add("hidden");
    await sync({quiet:true});
  }
  startAutoRefresh();
  if("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("./service-worker.js").catch(console.error);
}
init();
