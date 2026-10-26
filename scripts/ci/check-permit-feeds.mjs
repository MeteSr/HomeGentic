#!/usr/bin/env node
// Discovery pass: print the schemas and sample rows of the public permit feeds.
const get = async (url) => {
  const r = await fetch(url, { headers: { accept: "application/json" } });
  const t = await r.text();
  console.log(`\n=== ${r.status} ${url}`);
  try { return JSON.parse(t); } catch { console.log(t.slice(0, 2000)); return null; }
};
const show = (x) => console.log(JSON.stringify(x, null, 1).slice(0, 12000));

const orl = await get("https://data.cityoforlando.net/api/views/ryhf-m453.json");
if (orl) show({ name: orl.name, rowsUpdatedAt: orl.rowsUpdatedAt, columns: (orl.columns ?? []).map((c) => [c.fieldName, c.name, c.dataTypeName]) });
show(await get("https://data.cityoforlando.net/resource/ryhf-m453.json?$limit=3&$order=:id%20DESC"));
show(await get("https://data.cityoforlando.net/resource/ryhf-m453.json?$select=application_type,count(*)&$group=application_type&$order=count(*)%20DESC&$limit=40"));
show(await get("https://data.cityoforlando.net/resource/ryhf-m453.json?$select=worktype,count(*)&$group=worktype&$order=count(*)%20DESC&$limit=40"));

show(await get("https://gis.lakecountyfl.gov/lakegis/rest/services/PropertyAppraiser?f=json"));
const lake = "https://gis.lakecountyfl.gov/lakegis/rest/services/PropertyAppraiser/PermitMap_Working/MapServer/1";
const lk = await get(`${lake}?f=json`);
if (lk) show({ name: lk.name, type: lk.type, description: lk.description, maxRecordCount: lk.maxRecordCount, fields: (lk.fields ?? []).map((f) => [f.name, f.alias, f.type]) });
show(await get(`${lake}/query?where=1%3D1&outFields=*&returnGeometry=false&resultRecordCount=3&f=json`));
for (const fld of ["CITY", "SITE_CITY", "JURISDICTION", "PERMIT_TYPE", "TYPE", "STATUS"]) {
  show(await get(`${lake}/query?where=1%3D1&outFields=${fld}&returnGeometry=false&returnDistinctValues=true&resultRecordCount=60&f=json`));
}
show(await get(`${lake}/query?where=1%3D1&returnCountOnly=true&f=json`));
