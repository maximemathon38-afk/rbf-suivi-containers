
const cfg = window.RBF_CONFIG || {};
const API_BASE = (cfg.SUPABASE_URL || "").trim().replace(/\/rest\/v1\/?$/i,"").replace(/\/$/,"") + "/rest/v1";
const API_KEY = cfg.SUPABASE_ANON_KEY || "";

function isConfigured(){ return Boolean(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY); }

async function api(path, {method="GET", body=null, prefer=""} = {}) {
  if(!isConfigured()) throw new Error("CONFIG_MISSING");
  const headers = {
    "apikey": API_KEY,
    "Accept": "application/json"
  };
  if(body !== null) headers["Content-Type"] = "application/json";
  if(prefer) headers["Prefer"] = prefer;
  const res = await fetch(API_BASE + path, {
    method, headers,
    body: body === null ? undefined : JSON.stringify(body)
  });
  if(!res.ok){
    const detail = await res.text();
    throw new Error(`API ${res.status}: ${detail}`);
  }
  const txt = await res.text();
  return txt ? JSON.parse(txt) : null;
}

const DB = {
  configured: isConfigured,

  async loadAll(){
    const [chefs, containers, catalog, items, history] = await Promise.all([
      api("/chefs?select=*&order=name.asc"),
      api("/containers?select=*&order=name.asc"),
      api("/catalog?select=*&order=name.asc"),
      api("/container_items?select=*&order=name.asc"),
      api("/history?select=*&order=created_at.desc&limit=300")
    ]);
    return {chefs, containers, catalog, items, history};
  },

  async updateItem(itemId, patch){
    return api(`/container_items?id=eq.${encodeURIComponent(itemId)}`, {
      method:"PATCH", body:patch, prefer:"return=representation"
    });
  },

  async addContainerItem(containerId, name, expected){
    return api("/container_items", {
      method:"POST",
      body:{
        container_id:containerId,
        catalog_id:null,
        name,
        expected,
        present:expected,
        repair:0
      },
      prefer:"return=representation"
    });
  },

  async deleteContainerItem(itemId){
    return api(`/container_items?id=eq.${encodeURIComponent(itemId)}`, {
      method:"DELETE"
    });
  },

  async updateContainer(containerId, patch){
    return api(`/containers?id=eq.${encodeURIComponent(containerId)}`, {
      method:"PATCH", body:patch, prefer:"return=representation"
    });
  },

  async addHistory(entry){
    return api("/history", {method:"POST", body:entry, prefer:"return=representation"});
  },

  async addCatalog(name, defaultExpected, containers){
    const rows = await api("/catalog", {
      method:"POST",
      body:{name, default_expected:defaultExpected},
      prefer:"return=representation"
    });
    const cat = rows[0];
    const itemRows = containers.map(c => ({
      container_id:c.id, catalog_id:cat.id, name:cat.name,
      expected:defaultExpected, present:defaultExpected, repair:0
    }));
    if(itemRows.length) await api("/container_items", {method:"POST", body:itemRows});
    return cat;
  },

  async editCatalog(id, name, defaultExpected){
    await api(`/catalog?id=eq.${encodeURIComponent(id)}`, {
      method:"PATCH", body:{name, default_expected:defaultExpected}
    });
    await api(`/container_items?catalog_id=eq.${encodeURIComponent(id)}`, {
      method:"PATCH", body:{name, expected:defaultExpected}
    });
  },

  async deleteCatalog(id){
    await api(`/container_items?catalog_id=eq.${encodeURIComponent(id)}`, {method:"DELETE"});
    await api(`/catalog?id=eq.${encodeURIComponent(id)}`, {method:"DELETE"});
  }
};

